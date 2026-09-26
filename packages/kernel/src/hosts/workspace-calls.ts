import { isAbsolute } from 'node:path';
import type { CapabilityName, Json, KernelErrorCode, Problem, RpcResult } from '@kvman/protocol';
import { kernelProblem, type ProblemContext } from '../problems.ts';
import type { GrantsSource } from '../router/grants.ts';
import type { Connection } from '../storage/driver.ts';
import { errnoCode, FileRefusal, globFiles, listFolder, makeFolder, readText, removePath, statPath, writeBytes } from '../workspaces/workspace-io.ts';
import { PathEscape, resolveInJail, type Jail, type JailedPath } from '../workspaces/workspace-jail.ts';
import type { ActiveInvocation } from './active-invocation.ts';
import type { ServiceCall } from './invocation-sink.ts';
import type { TrustService } from './trust-service.ts';
import { readWorkspace } from './workspace-rows.ts';

export type WorkspaceCall = Extract<ServiceCall, { name: `workspace.${string}` }>;

export type WorkspaceCallsDeps = { connection: Connection; grants: GrantsSource; trust: TrustService; home: string };

// Where a call acts: the jail of its workspace.
type Place = { jail: Jail; workspaceId: string };

const writing = new Set<WorkspaceCall['name']>(['workspace.write', 'workspace.mkdir', 'workspace.rm']);

class CallRefused extends Error {
  readonly code: KernelErrorCode;
  readonly context: Omit<ProblemContext, 'correlationId' | 'messageId'>;

  constructor(code: KernelErrorCode, context: Omit<ProblemContext, 'correlationId' | 'messageId'>) {
    super(context.detail ?? code);
    this.name = 'CallRefused';
    this.code = code;
    this.context = context;
  }
}

function refusedBy(error: unknown): CallRefused {
  if (error instanceof CallRefused) return error;
  if (error instanceof PathEscape) return new CallRefused('WORKSPACE_ESCAPE', { detail: error.message, hint: 'use a path inside the workspace' });
  if (error instanceof FileRefusal) return new CallRefused(error.code, { detail: error.message, ...(error.params === undefined ? {} : { params: error.params }), ...(error.hint === undefined ? {} : { hint: error.hint }) });
  const errno = error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : 'unknown';
  return new CallRefused(errnoCode(error), { detail: `the workspace file operation failed (${errno})` });
}

// 07 §7.2, ADR 0136: ctx.files at the kernel's workspace I/O edge. Each call needs its capability and a workspace;
// its path goes through the jail, and a path under .kvman/ through the trust gate, which a write closes.
export class WorkspaceCalls {
  readonly #deps: WorkspaceCallsDeps;

  constructor(deps: WorkspaceCallsDeps) {
    this.#deps = deps;
  }

  async handle(invocation: ActiveInvocation, call: WorkspaceCall): Promise<RpcResult> {
    try {
      const need: CapabilityName = writing.has(call.name) ? 'files.write' : 'files.read';
      const place = this.#place(invocation, need);
      if (call.name === 'workspace.glob') return { ok: true, value: await this.#glob(place, call.pattern) };
      const target = await this.#open(place, call.path);
      const value = await this.#run(target, call);
      if (target.gated && writing.has(call.name)) await this.#deps.trust.close(place.workspaceId);
      return value === undefined ? { ok: true } : { ok: true, value };
    } catch (error) {
      return { ok: false, problem: this.#problem(invocation, refusedBy(error)) };
    }
  }

  // blobs.put({ workspacePath }) reads a workspace file like ctx.files.read (ADR 0136).
  async readable(invocation: ActiveInvocation, path: string): Promise<{ ok: true; real: string } | { ok: false; problem: Problem }> {
    try {
      const target = await this.#open(this.#place(invocation, 'files.read'), path);
      return { ok: true, real: target.real };
    } catch (error) {
      return { ok: false, problem: this.#problem(invocation, refusedBy(error)) };
    }
  }

  async #run(target: JailedPath, call: Exclude<WorkspaceCall, { name: 'workspace.glob' }>): Promise<Json | undefined> {
    switch (call.name) {
      case 'workspace.read':
        return readText(target.real);
      case 'workspace.write':
        await writeBytes(target.real, 'text' in call.content ? Buffer.from(call.content.text, 'utf8') : Buffer.from(call.content.base64, 'base64'));
        return undefined;
      case 'workspace.list':
        return listFolder(target.real);
      case 'workspace.stat':
        return statPath(target.real);
      case 'workspace.mkdir':
        await makeFolder(target.real);
        return undefined;
      case 'workspace.rm':
        if (target.relative === '.') throw new CallRefused('VALIDATION_FAILED', { detail: 'the workspace root cannot be removed' });
        await removePath(target.real, call.recursive);
        return undefined;
    }
  }

  async #open({ jail, workspaceId }: Place, path: string): Promise<JailedPath> {
    const target = resolveInJail(jail, path);
    if (target.gated && !(await this.#deps.trust.open({ id: workspaceId, path: jail.root }))) {
      throw new CallRefused('WORKSPACE_UNTRUSTED', { detail: 'the workspace files under .kvman/ are not trusted', hint: 'ask the person to trust the workspace' });
    }
    return target;
  }

  // Matches outside the jail (through a symlinked folder) are not workspace files and are left out.
  async #glob({ jail, workspaceId }: Place, pattern: string): Promise<string[]> {
    if (isAbsolute(pattern) || pattern.split(/[\\/]/).includes('..')) throw new PathEscape(pattern);
    const open = await this.#deps.trust.open({ id: workspaceId, path: jail.root });
    const matches = await globFiles(jail.root, pattern, open);
    return matches.filter((match) => {
      try {
        return resolveInJail(jail, match).gated ? open : true;
      } catch (error) {
        if (error instanceof PathEscape) return false;
        throw error;
      }
    });
  }

  #place(invocation: ActiveInvocation, need: CapabilityName): Place {
    const { extension, message } = invocation.claim;
    if (message.workspaceId === undefined) throw new CallRefused('WORKSPACE_INVALID', { detail: 'this handler has no workspace, so it has no files' });
    const granted = this.#deps.grants.capabilities(extension, message.workspaceId)?.requested.some((capability) => capability.name === need) === true;
    if (!granted) throw new CallRefused('CAPABILITY_DENIED', { detail: `${extension} is not granted ${need}`, hint: `request ${need}` });
    const workspace = readWorkspace(this.#deps.connection, message.workspaceId);
    if (workspace === undefined) throw new CallRefused('WORKSPACE_INVALID', { detail: `no workspace ${message.workspaceId} exists` });
    return { jail: { root: workspace.path, home: this.#deps.home }, workspaceId: workspace.id };
  }

  #problem(invocation: ActiveInvocation, refused: CallRefused): Problem {
    const { message } = invocation.claim;
    return kernelProblem(refused.code, { correlationId: message.correlationId, messageId: message.id, ...refused.context });
  }
}

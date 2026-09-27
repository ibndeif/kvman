import { statSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { jsonByteLength, limits, processLimits, type KernelErrorCode, type RpcResult, type SpawnOptions } from '@kvman/protocol';
import { kernelProblem } from '../problems.ts';
import { ProcessStartFailed, type ProcessSupervisor, type SpawnPlan } from '../processes/process-supervisor.ts';
import type { JobTokens } from '../processes/job-tokens.ts';
import type { KernelRegistry } from '../registry/kernel-registry.ts';
import type { GrantsSource } from '../router/grants.ts';
import type { DelegatingActor } from '../storage/commit-unit.ts';
import type { Connection } from '../storage/driver.ts';
import { processOwner } from '../storage/process-rows.ts';
import type { UlidGenerator } from '../ulid.ts';
import { PathEscape, resolveInJail } from '../workspaces/workspace-jail.ts';
import type { ActiveInvocation } from './active-invocation.ts';
import type { ServiceCall } from './invocation-sink.ts';
import type { LiveAddress } from './live-bus.ts';
import { readWorkspace } from './workspace-rows.ts';

export type ProcessCall = Extract<ServiceCall, { name: `process.${string}` }>;

export type ProcessCallsDeps = {
  connection: Connection;
  registry: () => KernelRegistry;
  grants: GrantsSource;
  supervisor: ProcessSupervisor;
  tokens: JobTokens;
  ids: UlidGenerator;
  // The real path of the home folder, which a working folder may not be in (ADR 0136).
  home: string;
};

class CallRefused extends Error {
  readonly code: KernelErrorCode;
  readonly hint: string | undefined;

  constructor(code: KernelErrorCode, detail: string, hint?: string) {
    super(detail);
    this.name = 'CallRefused';
    this.code = code;
    this.hint = hint;
  }
}

function refusedBy(error: unknown): CallRefused {
  if (error instanceof CallRefused) return error;
  if (error instanceof PathEscape) return new CallRefused('WORKSPACE_ESCAPE', 'the working folder leaves the workspace', 'use a folder inside the workspace');
  if (error instanceof ProcessStartFailed) return new CallRefused('INTERNAL', error.message);
  throw error;
}

function existingFolder(path: string): void {
  const stat = statSync(path, { throwIfNoEntry: false });
  if (stat === undefined || !stat.isDirectory()) throw new CallRefused('NOT_FOUND', 'the working folder does not exist or is not a folder');
}

// 03 §3.7, ADR 0139: ctx.process at the kernel. Every call needs `process` where the invocation runs; a spawn's
// options are checked, its folder jailed, and its token's actor fixed before the supervisor starts anything.
export class ProcessCalls {
  readonly #deps: ProcessCallsDeps;

  constructor(deps: ProcessCallsDeps) {
    this.#deps = deps;
  }

  async handle(invocation: ActiveInvocation, call: ProcessCall): Promise<RpcResult> {
    try {
      this.#granted(invocation);
      if (call.name === 'process.spawn') return { ok: true, value: { processId: await this.#spawn(invocation, call.options) } };
      if (call.name === 'process.wait') return await this.#wait(invocation, call.processId);
      this.#kill(invocation, call.processId);
      return { ok: true };
    } catch (error) {
      const refused = refusedBy(error);
      const { message } = invocation.claim;
      return {
        ok: false,
        problem: kernelProblem(refused.code, { correlationId: message.correlationId, messageId: message.id, detail: refused.message, ...(refused.hint === undefined ? {} : { hint: refused.hint }) }),
      };
    }
  }

  #granted(invocation: ActiveInvocation): void {
    const { extension, message } = invocation.claim;
    const granted = this.#deps.grants.capabilities(extension, message.workspaceId)?.requested.some((capability) => capability.name === 'process') === true;
    if (!granted) throw new CallRefused('CAPABILITY_DENIED', `${extension} is not granted process`, "add ext.requestCapability('process', { reason })");
  }

  async #spawn(invocation: ActiveInvocation, options: SpawnOptions): Promise<string> {
    const { extension, message } = invocation.claim;
    const detached = options.detached === true;
    this.#checkOnExit(invocation, detached, options.onExit);
    const live = options.live === undefined ? undefined : this.#liveAddress(invocation, options.live);
    const cwd = this.#folder(invocation, options.cwd);
    const processId = this.#deps.ids.next();
    const plan: SpawnPlan = {
      processId, extension, invocationId: invocation.id, message, command: options.command, args: options.args ?? [], cwd, env: options.env ?? {},
      stdin: options.stdin, logCapBytes: options.logCapBytes ?? processLimits.defaultLogCapBytes, timeoutMs: options.timeoutMs, detached, onExit: options.onExit, live,
      token: options.token === undefined ? undefined : {
        spawner: extension, cause: message, calls: options.token.calls, context: this.#tokenContext(invocation, options.token.context ?? {}),
        delegatedBy: options.token.delegate === true ? this.#delegatingActor(invocation) : undefined,
      },
    };
    if (live !== undefined) invocation.live.set(`${live.type}:${live.key}`, live);
    await this.#deps.supervisor.spawn(plan);
    return processId;
  }

  async #wait(invocation: ActiveInvocation, processId: string): Promise<RpcResult> {
    const waiting = this.#deps.supervisor.wait(processId, invocation.id);
    if (waiting === undefined) throw new CallRefused('NOT_FOUND', `no process ${processId} was spawned by this invocation`);
    const result = await waiting;
    if (result === undefined) throw new CallRefused('INTERNAL', `the end of process ${processId} could not be recorded`);
    invocation.received.add(result.logBlobId);
    return { ok: true, value: result };
  }

  // A live process the extension owns is killed; its own ended process is a no-op; anything else is not found.
  #kill(invocation: ActiveInvocation, processId: string): void {
    const { extension } = invocation.claim;
    if (this.#deps.supervisor.kill(processId, extension) === 'killed') return;
    if (processOwner(this.#deps.connection, processId)?.extension === extension) return;
    throw new CallRefused('NOT_FOUND', `${extension} owns no process ${processId}`);
  }

  // detached requires onExit, one of the spawner's own internal commands, and onExit requires detached.
  #checkOnExit(invocation: ActiveInvocation, detached: boolean, onExit: string | undefined): void {
    if (detached && onExit === undefined) throw new CallRefused('VALIDATION_FAILED', 'a detached process needs onExit', 'name one of your own internal commands');
    if (onExit === undefined) return;
    if (!detached) throw new CallRefused('VALIDATION_FAILED', 'onExit is only for a detached process', 'add detached: true');
    const { extension, message } = invocation.claim;
    const lookup = this.#deps.registry().lookup(onExit, message.workspaceId);
    const own = lookup.ok && lookup.resolved.extension === extension && lookup.resolved.entry.kind === 'command' && lookup.resolved.entry.access === 'internal';
    if (!own) throw new CallRefused('VALIDATION_FAILED', `"${onExit}" is not an internal command of ${extension}`, 'onExit is one of your own internal commands');
  }

  #liveAddress(invocation: ActiveInvocation, address: string): LiveAddress {
    const { extension, message } = invocation.claim;
    const colon = address.indexOf(':');
    const type = address.slice(0, colon);
    const lookup = this.#deps.registry().lookup(type, message.workspaceId);
    const entry = lookup.ok ? lookup.resolved.entry : undefined;
    if (!lookup.ok || entry?.kind !== 'event' || entry.delivery !== 'live' || lookup.resolved.extension !== extension) {
      throw new CallRefused('CAPABILITY_DENIED', `"${type}" is not a live event of ${extension}`);
    }
    if (entry.chunk !== 'text') throw new CallRefused('VALIDATION_FAILED', `"${type}" does not stream text chunks`);
    return { type, key: address.slice(colon + 1), workspaceId: message.workspaceId };
  }

  // A handler with a workspace works inside it (the realpath jail); one without passes an absolute folder.
  #folder(invocation: ActiveInvocation, cwd: string | undefined): string {
    const { workspaceId } = invocation.claim.message;
    if (workspaceId === undefined) {
      if (cwd === undefined || !isAbsolute(cwd)) throw new CallRefused('WORKSPACE_INVALID', 'this handler has no workspace, so it passes an absolute cwd');
      existingFolder(cwd);
      return cwd;
    }
    const workspace = readWorkspace(this.#deps.connection, workspaceId);
    if (workspace === undefined) throw new CallRefused('WORKSPACE_INVALID', `no workspace ${workspaceId} exists`);
    const target = resolveInJail({ root: workspace.path, home: this.#deps.home }, cwd ?? '.');
    existingFolder(target.real);
    return target.real;
  }

  // The locale is inherited and set by the kernel (ADR 0054); the context a kv call carries stays within its limit.
  #tokenContext(invocation: ActiveInvocation, context: Record<string, string>): Record<string, string> {
    if ('locale' in context) throw new CallRefused('VALIDATION_FAILED', 'locale is set by the kernel and cannot be changed');
    if (jsonByteLength({ ...invocation.claim.message.context, ...context }) > limits.contextBytes) {
      throw new CallRefused('VALIDATION_FAILED', `the context of the token's calls is over ${limits.contextBytes} bytes`);
    }
    return context;
  }

  // ADR 0140: the actor of a delegated token is the source of the message whose handler spawns, fixed now.
  #delegatingActor(invocation: ActiveInvocation): DelegatingActor | undefined {
    const { source } = invocation.claim.message;
    if (source.startsWith('user:')) return { kind: 'person' };
    if (source.startsWith('ext:')) return { kind: 'extension', extension: source.slice('ext:'.length) };
    if (source.startsWith('proc:')) return this.#deps.tokens.actorOf(source.slice('proc:'.length)) ?? { kind: 'nobody' };
    return undefined;
  }
}

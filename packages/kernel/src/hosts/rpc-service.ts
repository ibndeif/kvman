import type { JsonObject, Problem, RpcCall, RpcResult } from '@kvman/protocol';
import { mergedConfig } from '../config/config-values.ts';
import { kernelProblem, ProblemError } from '../problems.ts';
import type { KernelRegistry } from '../registry/kernel-registry.ts';
import type { SecretStore } from '../secrets/secret-store.ts';
import { readConfigRow } from '../storage/config-rows.ts';
import { receivedFrom } from '../blobs/received-blobs.ts';
import type { StepJournal } from '../store/step-journal.ts';
import type { BlobCalls } from './blob-calls.ts';
import { extensionSender, type ActiveInvocation } from './active-invocation.ts';
import { callCommand, type CommandCallDeps } from './command-calls.ts';
import type { ServiceCall } from './invocation-sink.ts';
import { redactFields, redactText, type KernelLogger, type LogAttributes } from './kernel-logger.ts';
import type { LiveBus } from './live-bus.ts';
import { publishLive } from './live-calls.ts';
import type { QueryPath } from './query-path.ts';
import type { WorkspaceCalls } from './workspace-calls.ts';

export type RpcServiceDeps = CommandCallDeps & {
  registry: () => KernelRegistry;
  queries: QueryPath;
  live: LiveBus;
  journal: StepJournal;
  logger: KernelLogger;
  secrets: SecretStore;
  blobs: BlobCalls;
  files: WorkspaceCalls;
};

// A query reads and may query; everything else a handler can do is refused to it (ADR 0074).
const queryAllowed = new Set<RpcCall['name']>([
  'query', 'log', 'config.get', 'secret.get', 'blobs.stat', 'blobs.read', 'workspace.read', 'workspace.list', 'workspace.stat', 'workspace.glob',
]);

export function attributesOf(invocation: ActiveInvocation): LogAttributes {
  const { message, extension, attempt } = invocation.claim;
  return {
    correlationId: message.correlationId, messageId: message.id, type: message.type, extension, attempt,
    ...(message.workspaceId === undefined ? {} : { workspaceId: message.workspaceId }),
  };
}

function problemResult(error: unknown): RpcResult {
  if (error instanceof ProblemError) return { ok: false, problem: error.problem };
  throw error;
}

// The kernel's side of a host's `rpc` frames (03 §3.5): each call is checked against the invocation first.
export class RpcService {
  readonly #deps: RpcServiceDeps;

  constructor(deps: RpcServiceDeps) {
    this.#deps = deps;
  }

  async handle(invocation: ActiveInvocation, call: ServiceCall): Promise<RpcResult> {
    const { message } = invocation.claim;
    if (message.kind === 'query' && !queryAllowed.has(call.name)) return { ok: false, problem: this.#queryDenied(invocation, call.name) };
    switch (call.name) {
      case 'command':
        return this.#received(invocation, call.type, await callCommand(this.#deps, invocation, call));
      case 'query':
        return this.#received(invocation, call.type, await this.#deps.queries.ask({
          sender: extensionSender(invocation), type: call.type, payload: call.payload, cause: message, workspaceId: message.workspaceId, received: invocation.received,
        }));
      case 'blobs.put.open':
      case 'blobs.put.write':
      case 'blobs.put.close':
      case 'blobs.put.file':
      case 'blobs.stat':
      case 'blobs.read':
        return this.#deps.blobs.handle(invocation, call);
      case 'workspace.read':
      case 'workspace.write':
      case 'workspace.list':
      case 'workspace.stat':
      case 'workspace.mkdir':
      case 'workspace.rm':
      case 'workspace.glob':
        return this.#deps.files.handle(invocation, call);
      case 'live':
        return this.#publishLive(invocation, call);
      case 'step.begin':
        return this.#beginStep(invocation, call);
      case 'step.end':
        return this.#endStep(invocation, call);
      case 'config.get':
        return { ok: true, value: this.#config(invocation, call) };
      case 'secret.get': {
        const value = this.#deps.secrets.get(invocation.claim.extension, call.secret);
        return value === undefined ? { ok: true } : { ok: true, value };
      }
      case 'log':
        this.#deps.logger.write({ level: call.level, message: redactText(call.message), fields: redactFields(call.fields ?? {}), attributes: attributesOf(invocation) });
        return { ok: true };
    }
  }

  // ADR 0134: a ctx.command reply or ctx.query result hands its z.blobId() fields to the calling invocation.
  #received(invocation: ActiveInvocation, type: string, result: RpcResult): RpcResult {
    if (!result.ok || result.value === undefined) return result;
    const call = { type, workspaceId: invocation.claim.message.workspaceId };
    for (const blobId of receivedFrom(this.#deps.registry(), call, result.value)) invocation.received.add(blobId);
    return result;
  }

  // ADR 0125: the extension's own config, its handler's pending values over the stored rows; rows hold no secrets.
  #config(invocation: ActiveInvocation, call: Extract<RpcCall, { name: 'config.get' }>): JsonObject {
    const { extension, message } = invocation.claim;
    const schema = this.#deps.registry().manifestOf(extension)?.config?.schema ?? {};
    const { connection } = this.#deps;
    const global = call.pending.global ?? readConfigRow(connection, extension, undefined).value;
    const workspace = message.workspaceId === undefined ? undefined : call.pending.workspace ?? readConfigRow(connection, extension, message.workspaceId).value;
    return mergedConfig(schema, global, workspace);
  }

  #beginStep(invocation: ActiveInvocation, call: Extract<RpcCall, { name: 'step.begin' }>): RpcResult {
    const { message } = invocation.claim;
    try {
      this.#deps.values.append(message.id, call.recorded);
      const start = this.#deps.journal.begin({ messageId: message.id, name: call.step, correlationId: message.correlationId }, call.retrySafe);
      if (start.status === 'run') {
        this.#deps.faults.reach('step.after-begin');
        return { ok: true, value: { status: 'run' } };
      }
      return { ok: true, value: start.result === undefined ? { status: 'recorded' } : { status: 'recorded', result: start.result } };
    } catch (error) {
      return problemResult(error);
    }
  }

  #endStep(invocation: ActiveInvocation, call: Extract<RpcCall, { name: 'step.end' }>): RpcResult {
    const { message } = invocation.claim;
    try {
      this.#deps.faults.reach('step.before-record');
      this.#deps.journal.record({ messageId: message.id, name: call.step, correlationId: message.correlationId }, call.result);
      return { ok: true };
    } catch (error) {
      return problemResult(error);
    }
  }

  #publishLive(invocation: ActiveInvocation, call: Extract<RpcCall, { name: 'live' }>): RpcResult {
    const result = publishLive(this.#deps.registry(), this.#deps.live, invocation, call);
    if (result.ok) this.#deps.faults.reach('live.after-publish-before-commit');
    return result;
  }

  #queryDenied(invocation: ActiveInvocation, name: RpcCall['name']): Problem {
    const { message } = invocation.claim;
    return kernelProblem('CAPABILITY_DENIED', { correlationId: message.correlationId, messageId: message.id, detail: `a query cannot call ${name}` });
  }
}

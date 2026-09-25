import { hostToKernelFrameSchema, type CompleteFrame, type KernelToHostFrame, type Problem, type RpcCall, type RpcResult } from '@kvman/protocol';
import { kernelProblem } from '../problems.ts';
import type { KernelRegistry } from '../registry/kernel-registry.ts';
import type { Claim, DispatchTarget, Dispatcher, HostLoad } from '../scheduler/dispatcher.ts';
import type { Connection } from '../storage/driver.ts';
import type { UlidGenerator } from '../ulid.ts';
import type { ActiveInvocation } from './active-invocation.ts';
import type { StartHostThread } from './host-thread.ts';
import type { KernelLogger } from './kernel-logger.ts';
import { noRecordedValues, type RecordedValueStore } from './recorded-value-store.ts';
import { WorkerPool, type PoolWorker } from './worker-pool.ts';
import { readWorkspace } from './workspace-rows.ts';

// Each extension's entry module; given as data until M2.2's snapshots provide it (ADR 0071).
export interface ExtensionModules {
  entry(extension: string): string;
}

// Where host events go: the RPC service and the settlement of invocations.
export interface InvocationSink {
  called(invocation: ActiveInvocation, call: RpcCall): Promise<RpcResult>;
  completed(invocation: ActiveInvocation, frame: CompleteFrame): Promise<void>;
  lost(invocation: ActiveInvocation): Promise<void>;
  refused(claim: Claim, problem: Problem): Promise<void>;
}

export type HostManagerOptions = {
  connection: Connection;
  registry: () => KernelRegistry;
  modules: ExtensionModules;
  values: RecordedValueStore;
  logger: KernelLogger;
  ids: UlidGenerator;
  poolSize: number;
  startThread: StartHostThread;
};

// The shared pool behind the scheduler's dispatcher interface (ADR 0060, 0071): it sends invocations to workers and
// routes their frames. A frame that fails validation is the loss of its worker (ADR 0076).
export class HostManager implements Dispatcher {
  readonly #options: HostManagerOptions;
  readonly #pool: WorkerPool;
  readonly #active = new Map<string, ActiveInvocation>();
  #sink: InvocationSink | undefined;
  #stopping = false;
  readonly #work = new Set<Promise<unknown>>();

  constructor(options: HostManagerOptions) {
    this.#options = options;
    this.#pool = new WorkerPool(options.poolSize, options.startThread, {
      frame: (worker, value) => this.#frame(worker, value),
      failed: (worker, error) => this.#log(`host thread ${worker.id} failed`, { error: error instanceof Error ? error.name : 'unknown' }),
      exit: (worker) => this.#exited(worker),
    });
  }

  connect(sink: InvocationSink): void {
    this.#sink = sink;
  }

  load(target: DispatchTarget): HostLoad {
    return this.#pool.load(target.extension);
  }

  dispatch(claim: Claim): void {
    if (this.#stopping) return;
    const sink = this.#connected();
    const { message } = claim;
    const workspace = message.workspaceId === undefined ? undefined : readWorkspace(this.#options.connection, message.workspaceId);
    if (message.workspaceId !== undefined && workspace === undefined) {
      const problem = kernelProblem('WORKSPACE_INVALID', { correlationId: message.correlationId, messageId: message.id, detail: `no workspace ${message.workspaceId} exists` });
      queueMicrotask(() => this.#track(sink.refused(claim, problem)));
      return;
    }
    const worker = this.#pool.acquire(claim.extension);
    const invocation: ActiveInvocation = { id: this.#options.ids.next(), claim, worker, live: new Map() };
    this.#active.set(invocation.id, invocation);
    this.#pool.post(worker, {
      frame: 'invoke', invocationId: invocation.id, extension: claim.extension, handler: claim.handler, kind: message.kind, message,
      readOnly: message.kind === 'query', recorded: claim.stored ? this.#options.values.load(message.id) : noRecordedValues,
      ...(workspace === undefined ? {} : { workspace }), ...this.#moduleFor(worker, claim.extension),
    });
  }

  // Workers stopped here end with the kernel: nothing more is dispatched, their frames and invocations are dropped
  // (recovery redelivers them, 03 §3.9), and the settlements and calls already started finish first.
  async stop(): Promise<void> {
    this.#stopping = true;
    this.#pool.stopAll();
    while (this.#work.size > 0) await Promise.allSettled([...this.#work]);
  }

  workers(): readonly PoolWorker[] {
    return this.#pool.workers();
  }

  #moduleFor(worker: PoolWorker, extension: string): Pick<Extract<KernelToHostFrame, { frame: 'invoke' }>, 'module'> {
    if (worker.loaded.has(extension)) return {};
    const manifest = this.#options.registry().manifestOf(extension);
    if (manifest === undefined) throw new Error(`no installed manifest for ${extension}`);
    worker.loaded.add(extension);
    return { module: { entry: this.#options.modules.entry(extension), manifest } };
  }

  #frame(worker: PoolWorker, value: unknown): void {
    if (this.#stopping) return;
    const parsed = hostToKernelFrameSchema.safeParse(value);
    if (!parsed.success) {
      const [issue] = parsed.error.issues;
      this.#log(`host thread ${worker.id} sent an invalid frame`, { path: issue?.path.join('.') ?? '', issue: issue?.message ?? '' });
      this.#pool.stop(worker);
      return;
    }
    const frame = parsed.data;
    const invocation = this.#active.get(frame.invocationId);
    if (frame.frame === 'rpc') {
      this.#call(worker, invocation, frame.callId, frame.invocationId, frame.call);
      return;
    }
    if (invocation === undefined || invocation.worker !== worker) return;
    this.#active.delete(invocation.id);
    this.#pool.release(worker);
    this.#track(this.#connected().completed(invocation, frame));
  }

  // A call from an invocation that already ended is answered with INTERNAL (ADR 0076).
  #call(worker: PoolWorker, invocation: ActiveInvocation | undefined, callId: number, invocationId: string, call: RpcCall): void {
    if (invocation === undefined || invocation.worker !== worker) {
      const problem = kernelProblem('INTERNAL', { correlationId: this.#options.ids.next(), detail: 'the invocation has ended' });
      this.#pool.post(worker, { frame: 'rpcResult', invocationId, callId, result: { ok: false, problem } });
      return;
    }
    this.#track(this.#connected().called(invocation, call).then((result) => {
      if (this.#active.get(invocationId) === invocation) this.#pool.post(worker, { frame: 'rpcResult', invocationId, callId, result });
    }));
  }

  #exited(worker: PoolWorker): void {
    if (this.#stopping) return;
    const sink = this.#connected();
    for (const invocation of [...this.#active.values()].filter((candidate) => candidate.worker === worker)) {
      this.#active.delete(invocation.id);
      this.#track(sink.lost(invocation));
    }
  }

  #track(work: Promise<unknown>): void {
    this.#work.add(work);
    void work.finally(() => this.#work.delete(work));
  }

  #log(message: string, fields: Record<string, string>): void {
    this.#options.logger.write({ level: 'warn', message, fields, attributes: { correlationId: this.#options.ids.next() } });
  }

  #connected(): InvocationSink {
    if (this.#sink === undefined) throw new Error('the host manager is not connected to its invocation sink');
    return this.#sink;
  }
}

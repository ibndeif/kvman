import {
  hostToKernelFrameSchema, type AbortReason, type CompleteFrame, type KernelErrorCode, type KernelToHostFrame, type Problem,
  type QuarantineReason, type RpcCall, type RpcResult,
} from '@kvman/protocol';
import { kernelProblem } from '../problems.ts';
import type { KernelRegistry } from '../registry/kernel-registry.ts';
import { kernelOwner } from '../registry/kernel-types.ts';
import type { Claim, DispatchTarget, Dispatcher, HostLoad } from '../scheduler/dispatcher.ts';
import type { SchedulerTimers, TimerHandle } from '../scheduler/timers.ts';
import type { Connection } from '../storage/driver.ts';
import type { UlidGenerator } from '../ulid.ts';
import type { ActiveInvocation } from './active-invocation.ts';
import type { HostFailures } from './host-failures.ts';
import type { StartHostThread } from './host-thread.ts';
import type { KernelLogger } from './kernel-logger.ts';
import { noRecordedValues, type RecordedValueStore } from './recorded-value-store.ts';
import { WorkerPool, type PoolWorker } from './worker-pool.ts';
import { readWorkspace } from './workspace-rows.ts';

// Each extension's entry module; given as data until M2.2's snapshots provide it (ADR 0071).
export interface ExtensionModules {
  entry(extension: string): string;
}

// Where host events go: the RPC service, the settlement of invocations, quarantine, and the kernel host.
export interface InvocationSink {
  called(invocation: ActiveInvocation, call: RpcCall): Promise<RpcResult>;
  completed(invocation: ActiveInvocation, frame: CompleteFrame): Promise<void>;
  loadFailed(invocation: ActiveInvocation, problem: Problem): Promise<void>;
  lost(invocation: ActiveInvocation): Promise<void>;
  refused(claim: Claim, problem: Problem): Promise<void>;
  timedOut(invocation: ActiveInvocation, reason: 'deadline' | 'timeout'): Promise<void>;
  aborted(invocation: ActiveInvocation): void;
  collateral(invocation: ActiveInvocation): Promise<void>;
  quarantine(extension: string, reason: QuarantineReason): Promise<void>;
  kernelCommand(claim: Claim): Promise<void>;
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
  timers: SchedulerTimers;
  now: () => number;
  failures: HostFailures;
};

// 03 §3.4: an invocation that has not settled 2 s after its abort makes its host stuck.
export const stuckGraceMs = 2_000;

type Aborted = { invocation: ActiveInvocation; reason: AbortReason; grace: TimerHandle };

function abortProblem({ invocation, reason }: Aborted): Problem {
  const { message } = invocation.claim;
  const codes: Record<AbortReason, KernelErrorCode> = { cancelled: 'CANCELLED', deadline: 'DEADLINE_EXCEEDED', timeout: message.kind === 'query' ? 'QUERY_TIMEOUT' : 'HANDLER_TIMEOUT' };
  return kernelProblem(codes[reason], { correlationId: message.correlationId, messageId: message.id });
}

// The shared pool behind the scheduler's dispatcher interface (ADRs 0060, 0071), with the supervision of 03 §3.6:
// invocation deadlines, aborts, stuck hosts, crashes and their charges (ADRs 0082, 0084). Kernel commands go to the
// kernel host (ADR 0078).
export class HostManager implements Dispatcher {
  readonly #options: HostManagerOptions;
  readonly #pool: WorkerPool;
  readonly #active = new Map<string, ActiveInvocation>();
  readonly #deadlines = new Map<string, TimerHandle>();
  readonly #aborted = new Map<string, Aborted>();
  readonly #work = new Set<Promise<unknown>>();
  #sink: InvocationSink | undefined;
  #stopping = false;

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
    if (target.extension === kernelOwner) return { host: kernelOwner, inFlight: 0, cap: Number.MAX_SAFE_INTEGER };
    return this.#pool.load(target.extension);
  }

  dispatch(claim: Claim): void {
    if (this.#stopping) return;
    const sink = this.#connected();
    if (claim.extension === kernelOwner) {
      this.#track(sink.kernelCommand(claim));
      return;
    }
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
    const delay = Math.max(0, claim.deadlineAt - this.#options.now());
    this.#deadlines.set(invocation.id, this.#options.timers.set(delay, () => this.#deadlineReached(invocation)));
    this.#pool.post(worker, {
      frame: 'invoke', invocationId: invocation.id, extension: claim.extension, handler: claim.handler, kind: message.kind, message,
      readOnly: message.kind === 'query', deadlineAt: claim.deadlineAt, recorded: claim.stored ? this.#options.values.load(message.id) : noRecordedValues,
      ...(workspace === undefined ? {} : { workspace }), ...this.#moduleFor(worker, claim.extension),
    });
  }

  // ADR 0083: the running invocations of cancelled messages are aborted; their live events are reset.
  abortMessages(messageIds: ReadonlySet<string>): void {
    for (const invocation of [...this.#active.values()].filter((candidate) => messageIds.has(candidate.claim.message.id))) {
      this.#abort(invocation, 'cancelled');
      this.#connected().aborted(invocation);
    }
  }

  // Workers stopped here end with the kernel: nothing more is dispatched, their frames and invocations are dropped
  // (recovery redelivers them, 03 §3.9), and the settlements and calls already started finish first.
  async stop(): Promise<void> {
    this.#stopping = true;
    for (const timer of [...this.#deadlines.values(), ...[...this.#aborted.values()].map((aborted) => aborted.grace)]) timer.cancel();
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

  #deadlineReached(invocation: ActiveInvocation): void {
    if (this.#active.get(invocation.id) !== invocation) return;
    const { deadlineAt } = invocation.claim.message;
    const reason = deadlineAt !== undefined && this.#options.now() >= deadlineAt ? 'deadline' : 'timeout';
    this.#abort(invocation, reason);
    this.#track(this.#connected().timedOut(invocation, reason));
  }

  #abort(invocation: ActiveInvocation, reason: AbortReason): void {
    this.#end(invocation);
    this.#pool.post(invocation.worker, { frame: 'abort', invocationId: invocation.id, reason });
    this.#aborted.set(invocation.id, { invocation, reason, grace: this.#options.timers.set(stuckGraceMs, () => this.#stuck(invocation)) });
  }

  #end(invocation: ActiveInvocation): void {
    this.#active.delete(invocation.id);
    this.#deadlines.get(invocation.id)?.cancel();
    this.#deadlines.delete(invocation.id);
  }

  // 03 §3.6: the stuck invocation's extension is charged; the rest of the worker returns without penalty.
  #stuck(invocation: ActiveInvocation): void {
    if (this.#aborted.get(invocation.id)?.invocation !== invocation) return;
    const { worker } = invocation;
    this.#charge(invocation.claim.extension);
    for (const other of [...this.#active.values()].filter((candidate) => candidate.worker === worker)) {
      this.#end(other);
      this.#track(this.#connected().collateral(other));
    }
    this.#forgetAborted(worker);
    this.#pool.stop(worker);
  }

  // ADR 0082: a crash charges every extension running on the worker, and each attempt counts.
  #exited(worker: PoolWorker): void {
    if (this.#stopping) return;
    const running = [...this.#active.values()].filter((invocation) => invocation.worker === worker);
    for (const extension of new Set(running.map((invocation) => invocation.claim.extension))) this.#charge(extension);
    for (const invocation of running) {
      this.#end(invocation);
      this.#track(this.#connected().lost(invocation));
    }
    this.#forgetAborted(worker);
  }

  #forgetAborted(worker: PoolWorker): void {
    for (const [id, aborted] of this.#aborted) {
      if (aborted.invocation.worker !== worker) continue;
      aborted.grace.cancel();
      this.#aborted.delete(id);
    }
  }

  #charge(extension: string): void {
    if (this.#options.failures.charge(extension, this.#options.now())) this.#track(this.#connected().quarantine(extension, 'HOST_FAILURES'));
  }

  #frame(worker: PoolWorker, value: unknown): void {
    if (this.#stopping) return;
    const parsed = hostToKernelFrameSchema.safeParse(value);
    if (!parsed.success) {
      const [issue] = parsed.error.issues;
      this.#log(`host thread ${worker.id} sent an invalid frame`, { path: issue?.path.join('.') ?? '', issue: issue?.message ?? '' });
      this.#pool.stop(worker);
      this.#exited(worker);
      return;
    }
    const frame = parsed.data;
    if (frame.frame === 'rpc') {
      this.#call(worker, frame.invocationId, frame.callId, frame.call);
      return;
    }
    const aborted = this.#aborted.get(frame.invocationId);
    if (aborted !== undefined && aborted.invocation.worker === worker) {
      aborted.grace.cancel();
      this.#aborted.delete(frame.invocationId);
      this.#pool.release(worker);
      return;
    }
    const invocation = this.#active.get(frame.invocationId);
    if (invocation === undefined || invocation.worker !== worker) return;
    this.#end(invocation);
    this.#pool.release(worker);
    const sink = this.#connected();
    this.#track(frame.frame === 'complete' ? sink.completed(invocation, frame) : sink.loadFailed(invocation, frame.problem));
  }

  // A call from an invocation that ended is answered with the problem that ended it (ADRs 0076, 0084).
  #call(worker: PoolWorker, invocationId: string, callId: number, call: RpcCall): void {
    const invocation = this.#active.get(invocationId);
    if (invocation === undefined || invocation.worker !== worker) {
      const aborted = this.#aborted.get(invocationId);
      const problem = aborted === undefined
        ? kernelProblem('INTERNAL', { correlationId: this.#options.ids.next(), detail: 'the invocation has ended' })
        : abortProblem(aborted);
      this.#pool.post(worker, { frame: 'rpcResult', invocationId, callId, result: { ok: false, problem } });
      return;
    }
    this.#track(this.#connected().called(invocation, call).then((result) => {
      if (this.#active.get(invocationId) === invocation) this.#pool.post(worker, { frame: 'rpcResult', invocationId, callId, result });
    }));
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

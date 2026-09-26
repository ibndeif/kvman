import { hostToKernelFrameSchema, type AbortReason, type KernelToHostFrame, type RpcCall, type RpcResult, type StoreRead } from '@kvman/protocol';
import type { FaultPoints } from '../faults/fault-points.ts';
import { kernelProblem } from '../problems.ts';
import type { KernelRegistry } from '../registry/kernel-registry.ts';
import { kernelOwner } from '../registry/kernel-types.ts';
import type { GrantsSource } from '../router/grants.ts';
import type { Claim, DispatchTarget, Dispatcher, HostLoad } from '../scheduler/dispatcher.ts';
import type { SchedulerTimers } from '../scheduler/timers.ts';
import type { Connection } from '../storage/driver.ts';
import type { UlidGenerator } from '../ulid.ts';
import type { ActiveInvocation } from './active-invocation.ts';
import { abortProblem } from './aborted-invocations.ts';
import type { HostFailures } from './host-failures.ts';
import { HostRegistry, type HostEntry } from './host-registry.ts';
import type { StartHostThread } from './host-thread.ts';
import type { InvocationSink } from './invocation-sink.ts';
import type { KernelLogger } from './kernel-logger.ts';
import type { ReadPool } from './read-pool/read-pool.ts';
import { noRecordedValues, type RecordedValueStore } from './recorded-value-store.ts';
import { RunningInvocations } from './running-invocations.ts';
import { SnapshotGate, type ExtensionSnapshots } from './snapshot-gate.ts';
import { serveStoreRead } from './store-read-calls.ts';
import type { PoolWorker } from './worker-pool.ts';
import { readWorkspace } from './workspace-rows.ts';

export type HostManagerOptions = {
  connection: Connection;
  registry: () => KernelRegistry;
  grants: GrantsSource;
  snapshots: ExtensionSnapshots;
  values: RecordedValueStore;
  logger: KernelLogger;
  ids: UlidGenerator;
  poolSize: number;
  startThread: StartHostThread;
  // A sandboxed host for an extension's verified snapshot folder (ADR 0129).
  startSandbox: (snapshotFolder: string) => StartHostThread;
  reads: ReadPool;
  timers: SchedulerTimers;
  now: () => number;
  failures: HostFailures;
  faults: FaultPoints;
};

// The execution hosts behind the scheduler's dispatcher interface (ADRs 0060, 0071), keyed by (extension, isolation)
// with the isolation granted where the message runs (03 §3.5), and the supervision of 03 §3.6: invocation deadlines,
// aborts, stuck hosts, crashes and their charges (ADRs 0082, 0084). Kernel commands go to the kernel host (ADR 0078).
export class HostManager implements Dispatcher {
  readonly #options: HostManagerOptions;
  readonly #hosts: HostRegistry;
  readonly #gate: SnapshotGate;
  readonly #running: RunningInvocations;
  readonly #work = new Set<Promise<unknown>>();
  #sink: InvocationSink | undefined;
  #idle: (() => void) | undefined;
  #stopping = false;

  constructor(options: HostManagerOptions) {
    this.#options = options;
    this.#gate = new SnapshotGate(options.snapshots);
    this.#running = new RunningInvocations(options.timers);
    this.#hosts = new HostRegistry({
      poolSize: options.poolSize, grants: options.grants, startThread: options.startThread, startSandbox: options.startSandbox, timers: options.timers,
      snapshotFolder: (extension) => this.#gate.entry(extension)?.folder,
      events: {
        frame: (worker, value) => this.#frame(worker, value),
        failed: (worker, error) => this.#log(`host ${worker.host} failed`, { error: error instanceof Error ? error.name : 'unknown' }),
        exit: (worker) => this.#exited(worker),
      },
    });
  }

  connect(sink: InvocationSink): void {
    this.#sink = sink;
  }

  load(target: DispatchTarget): HostLoad {
    if (target.extension === kernelOwner) return { host: kernelOwner, inFlight: 0, cap: Number.MAX_SAFE_INTEGER };
    return this.#hosts.load(target.extension, target.workspaceId);
  }

  dispatch(claim: Claim): void {
    if (this.#stopping) return;
    const sink = this.#connected();
    if (claim.extension === kernelOwner) {
      this.#track(sink.kernelCommand(claim));
      return;
    }
    const snapshot = this.#gate.entry(claim.extension);
    if (snapshot === undefined) {
      this.#track(this.#verifyThenDispatch(claim));
      return;
    }
    const { message } = claim;
    const workspace = message.workspaceId === undefined ? undefined : readWorkspace(this.#options.connection, message.workspaceId);
    if (message.workspaceId !== undefined && workspace === undefined) {
      const problem = kernelProblem('WORKSPACE_INVALID', { correlationId: message.correlationId, messageId: message.id, detail: `no workspace ${message.workspaceId} exists` });
      queueMicrotask(() => this.#track(sink.refused(claim, problem)));
      return;
    }
    const worker = this.#hosts.acquire(claim.extension, message.workspaceId);
    const invocation: ActiveInvocation = { id: this.#options.ids.next(), claim, worker, live: new Map() };
    this.#running.start(invocation, Math.max(0, claim.deadlineAt - this.#options.now()), () => this.#deadlineReached(invocation));
    this.#options.faults.reach('invoke.before');
    this.#hosts.post(worker, {
      frame: 'invoke', invocationId: invocation.id, extension: claim.extension, handler: claim.handler, kind: message.kind, message,
      readOnly: message.kind === 'query', deadlineAt: claim.deadlineAt, recorded: claim.stored ? this.#options.values.load(message.id) : noRecordedValues,
      ...(workspace === undefined ? {} : { workspace }), ...this.#moduleFor(worker, claim.extension, snapshot.entry),
    });
  }

  // 06 §6.5: the first load of an extension in this process waits for its snapshot's rehash; a mismatch fails the
  // message and quarantines the extension with EXT_INTEGRITY.
  async #verifyThenDispatch(claim: Claim): Promise<void> {
    const outcome = await this.#gate.admit(claim);
    if (outcome === 'dropped' || this.#stopping) return;
    if (outcome === 'verified') this.dispatch(claim);
    else await this.#connected().integrityFailed(claim);
  }

  // ADR 0083: the running invocations of cancelled messages are aborted; their live events are reset.
  abortMessages(messageIds: ReadonlySet<string>): void {
    this.#gate.drop(messageIds);
    for (const invocation of this.#running.all().filter((candidate) => messageIds.has(candidate.claim.message.id))) {
      this.#abort(invocation, 'cancelled');
      this.#connected().aborted(invocation);
    }
  }

  // 03 §3.9: shutdown lets running invocations finish for up to the grace, then interrupts the rest (ADR 0091); it
  // resolves once their redelivery has committed.
  drain(graceMs: number): Promise<void> {
    return new Promise((resolve) => {
      const finish = (): void => {
        grace.cancel();
        this.#idle = undefined;
        const waiting = this.#gate.takeAll().map((claim) => ({ claim, live: new Map() }));
        const interrupted = [...this.#running.all().map((invocation) => {
          this.#end(invocation);
          return invocation;
        }), ...waiting].map((run) => {
          const settled = this.#connected().interrupted(run);
          this.#track(settled);
          return settled;
        });
        void Promise.allSettled(interrupted).then(() => resolve());
      };
      const grace = this.#options.timers.set(graceMs, finish);
      this.#idle = finish;
      if (this.#running.size === 0) finish();
    });
  }

  // Hosts stopped here end with the kernel: nothing more is dispatched, their frames and invocations are dropped
  // (recovery redelivers them, 03 §3.9), and the settlements and calls already started finish first.
  async stop(): Promise<void> {
    this.#stopping = true;
    this.#running.cancelTimers();
    this.#hosts.stopAll();
    while (this.#work.size > 0) await Promise.allSettled([...this.#work]);
  }

  workers(): PoolWorker[] {
    return this.#hosts.list().map((entry) => entry.worker);
  }

  hosts(): HostEntry[] {
    return this.#hosts.list();
  }

  #moduleFor(worker: PoolWorker, extension: string, entry: string): Pick<Extract<KernelToHostFrame, { frame: 'invoke' }>, 'module'> {
    if (worker.loaded.has(extension)) return {};
    const manifest = this.#options.registry().manifestOf(extension);
    if (manifest === undefined) throw new Error(`no installed manifest for ${extension}`);
    worker.loaded.add(extension);
    return { module: { entry, manifest } };
  }

  #deadlineReached(invocation: ActiveInvocation): void {
    if (!this.#running.isRunning(invocation)) return;
    const { deadlineAt } = invocation.claim.message;
    const reason = deadlineAt !== undefined && this.#options.now() >= deadlineAt ? 'deadline' : 'timeout';
    this.#abort(invocation, reason);
    this.#track(this.#connected().timedOut(invocation, reason));
  }

  #abort(invocation: ActiveInvocation, reason: AbortReason): void {
    this.#running.abort(invocation, reason, () => this.#stuck(invocation));
    this.#afterEnd();
    this.#hosts.post(invocation.worker, { frame: 'abort', invocationId: invocation.id, reason });
  }

  #end(invocation: ActiveInvocation): void {
    this.#running.end(invocation);
    this.#afterEnd();
  }

  #afterEnd(): void {
    if (this.#running.size === 0) this.#idle?.();
  }

  // 03 §3.6: the stuck invocation's extension is charged; the rest of the host returns without penalty.
  #stuck(invocation: ActiveInvocation): void {
    if (!this.#running.isAborted(invocation)) return;
    const { worker } = invocation;
    this.#charge(invocation.claim.extension);
    for (const other of this.#running.runningOn(worker)) {
      this.#end(other);
      this.#track(this.#connected().collateral(other));
    }
    this.#running.forgetAborted(worker);
    this.#hosts.stop(worker);
  }

  // ADR 0082: a crash charges every extension running on the host, and each attempt counts.
  #exited(worker: PoolWorker): void {
    if (this.#stopping) return;
    const running = this.#running.runningOn(worker);
    for (const extension of new Set(running.map((invocation) => invocation.claim.extension))) this.#charge(extension);
    for (const invocation of running) {
      this.#end(invocation);
      this.#track(this.#connected().lost(invocation));
    }
    this.#running.forgetAborted(worker);
  }

  #charge(extension: string): void {
    if (this.#options.failures.charge(extension, this.#options.now())) this.#track(this.#connected().quarantine(extension, 'HOST_FAILURES'));
  }

  #frame(worker: PoolWorker, value: unknown): void {
    if (this.#stopping) return;
    const parsed = hostToKernelFrameSchema.safeParse(value);
    if (!parsed.success) {
      const [issue] = parsed.error.issues;
      this.#log(`host ${worker.host} sent an invalid frame`, { path: issue?.path.join('.') ?? '', issue: issue?.message ?? '' });
      this.#hosts.stop(worker);
      this.#exited(worker);
      return;
    }
    const frame = parsed.data;
    if (frame.frame === 'rpc') {
      this.#call(worker, frame.invocationId, frame.callId, frame.call);
      return;
    }
    const aborted = this.#running.abortedOn(worker, frame.invocationId);
    if (aborted !== undefined) {
      this.#running.settled(aborted);
      this.#hosts.release(worker);
      return;
    }
    const invocation = this.#running.on(worker, frame.invocationId);
    if (invocation === undefined) return;
    this.#end(invocation);
    this.#hosts.release(worker);
    const sink = this.#connected();
    this.#track(frame.frame === 'complete' ? sink.completed(invocation, frame) : sink.loadFailed(invocation, frame.problem));
  }

  // A call from an invocation that ended is answered with the problem that ended it (ADRs 0076, 0084).
  #call(worker: PoolWorker, invocationId: string, callId: number, call: RpcCall): void {
    const invocation = this.#running.on(worker, invocationId);
    if (invocation === undefined) {
      const aborted = this.#running.abortedOn(worker, invocationId);
      const problem = aborted === undefined
        ? kernelProblem('INTERNAL', { correlationId: this.#options.ids.next(), detail: 'the invocation has ended' })
        : abortProblem(aborted);
      this.#hosts.post(worker, { frame: 'rpcResult', invocationId, callId, result: { ok: false, problem } });
      return;
    }
    if (call.name === 'store.read') this.#track(this.#read(invocation, callId, call.read));
    else this.#track(this.#connected().called(invocation, call).then((result) => this.#answer(invocation, callId, result)));
  }

  async #read(invocation: ActiveInvocation, callId: number, read: StoreRead): Promise<void> {
    const outcome = await serveStoreRead(this.#options.reads, invocation.worker, invocation, read);
    if (!outcome.ok) this.#answer(invocation, callId, outcome);
    else if (this.#running.isRunning(invocation)) invocation.worker.thread.postValue?.(invocation.id, callId, outcome.value);
  }

  #answer(invocation: ActiveInvocation, callId: number, result: RpcResult): void {
    if (this.#running.isRunning(invocation)) this.#hosts.post(invocation.worker, { frame: 'rpcResult', invocationId: invocation.id, callId, result });
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

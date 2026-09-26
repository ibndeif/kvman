import type { Message, Problem } from '@kvman/protocol';
import { inertFaults, type FaultPoints } from '../faults/fault-points.ts';
import { kernelProblem } from '../problems.ts';
import type { HandlerSettings, KernelRegistry } from '../registry/kernel-registry.ts';
import type { CommitPipeline } from '../storage/commit-pipeline.ts';
import type { AdmittedMessage, CommitResult } from '../storage/commit-unit.ts';
import type { Connection } from '../storage/driver.ts';
import type { SpillFiles } from '../storage/spill.ts';
import { inWriteTransaction } from '../storage/write-transaction.ts';
import { BatchClaims } from './batch-claims.ts';
import { claimRunnable } from './claim-pass.ts';
import type { Claim, Dispatcher } from './dispatcher.ts';
import { InFlight, type RunningInvocation } from './in-flight.ts';
import { expiryUnit, redeliveryUnit } from './expiry.ts';
import { invocationDeadline } from './invocation-deadline.ts';
import { laneReentrancyProblem } from './lane-reentrancy.ts';
import type { PendingIndex } from './pending-index.ts';
import { QueryQueue } from './query-queue.ts';
import { retryOutcome, retryUnit, schedulerDefaults } from './retry-policy.ts';
import { Rotation } from './rotation.ts';
import type { PendingEntry } from './run-queues.ts';
import type { SchedulerTimers, TimerHandle } from './timers.ts';

export type SchedulerOptions = {
  connection: Connection;
  files: SpillFiles;
  pipeline: CommitPipeline;
  index: PendingIndex;
  registry: () => KernelRegistry;
  dispatcher: Dispatcher;
  now: () => number;
  timers: SchedulerTimers;
  // Units the scheduler commits on its own (deadline expiry, redelivery), for the reply waiters.
  onCommitted: (result: CommitResult) => void;
  faults?: FaultPoints;
};

export type ConflictOutcome = { rerun: true } | { rerun: false; result: CommitResult };

export class UnknownInvocation extends Error {
  constructor(messageId: string) {
    super(`the scheduler has no running invocation of ${messageId}`);
    this.name = 'UnknownInvocation';
  }
}

// The handler function of an entry: `command:<type>` or `subscription:<pattern>` (ADR 0053).
function referenceOf(entry: PendingEntry): string {
  return entry.handlerKey.slice(entry.handlerKey.indexOf('|') + 1);
}

function claimOf({ entry, message, attempt, deadlineAt }: RunningInvocation): Claim {
  return { message, extension: entry.extension, handler: referenceOf(entry), attempt, stored: entry.unstored === undefined, deadlineAt };
}

// 03 §3.4: picks runnable messages by class, workspace, and lane; enforces the limits; claims and dispatches them;
// fires timers; and settles failed attempts with retries and dead letters.
export class Scheduler {
  readonly #options: SchedulerOptions;
  readonly #inFlight = new InFlight();
  readonly #rotation = new Rotation();
  readonly #queries = new QueryQueue();
  readonly #faults: FaultPoints;
  readonly #batches: BatchClaims;
  #pumpRequested = false;
  #stopped = false;
  #started = false;
  #wake: { at: number; handle: TimerHandle } | undefined;

  constructor(options: SchedulerOptions) {
    this.#options = options;
    this.#faults = options.faults ?? inertFaults;
    options.index.onAdded(() => this.#requestPump());
    this.#batches = new BatchClaims({
      index: options.index, inFlight: this.#inFlight, claiming: () => this.#started && !this.#stopped,
      claimInto: (claimed) => this.#claimInto(claimed, options.now()), dispatch: (claimed) => this.#dispatchClaimed(claimed),
    });
    options.pipeline.attach(this.#batches);
  }

  // At boot, a lane whose message waits for its retry stays held so the rest of the lane stays behind it.
  // Nothing is claimed before start: boot recovery commits first, so a recovered message heads its lane (ADR 0091).
  start(): void {
    this.#started = true;
    for (const entry of this.#options.index.timerWheel()) {
      if (entry.laneKey !== undefined && entry.attempts > 0) this.#inFlight.holdLane(entry.laneKey, entry.id);
    }
    this.pump();
  }

  submitQuery(query: AdmittedMessage): void {
    this.#queries.push(query);
    this.#requestPump();
  }

  // A stopped scheduler claims nothing more; running invocations may still settle.
  stop(): void {
    this.#stopped = true;
    this.#wake?.handle.cancel();
    this.#wake = undefined;
  }

  pump(): void {
    this.#pumpRequested = false;
    if (this.#stopped || !this.#started) return;
    const now = this.#options.now();
    this.#options.index.promoteDue(now);
    const expired = this.#options.index.deadlines.due(now);
    if (expired.length > 0) void this.#expire(expired);
    this.#queries.drain((query) => this.#dispatchQuery(query));
    this.#dispatchPending(now);
    this.#arm(now);
  }

  // The invocation's unit committed (done, failed, or deferred): its lane and slots are free (ADR 0063).
  settled(messageId: string): void {
    this.#running(messageId);
    this.#inFlight.finish(messageId, false);
    this.#requestPump();
  }

  // A retryable failure of one attempt: back to pending after its backoff, or dead (ADRs 0059, 0061, 0062).
  async failed(messageId: string, problem: Problem): Promise<CommitResult> {
    const { entry, message, attempt } = this.#running(messageId);
    const maxAttempts = this.#settings(entry).maxAttempts ?? schedulerDefaults.maxAttempts;
    const outcome = retryOutcome(message, attempt, maxAttempts, problem, this.#options.now());
    const result = await this.#options.pipeline.enqueue(retryUnit(message, attempt, outcome));
    if (!result.committed) return result;
    this.#inFlight.finish(messageId, outcome.state === 'pending');
    if (outcome.state === 'pending') {
      this.#options.index.place({ ...entry, attempts: attempt, notBefore: outcome.notBefore, runnableSince: outcome.notBefore });
    }
    this.#requestPump();
    return result;
  }

  // A transient event's delivery that does not commit is dropped, never retried (ADR 0069).
  dropped(messageId: string): void {
    this.#running(messageId);
    this.#inFlight.finish(messageId, false);
    this.#requestPump();
  }

  // STORAGE_CONFLICT reruns the handler at once, 5 times per attempt; the sixth is a counted failure (ADR 0059).
  async conflicted(messageId: string): Promise<ConflictOutcome> {
    const invocation = this.#running(messageId);
    if (invocation.conflicts < schedulerDefaults.conflictReruns) {
      invocation.conflicts += 1;
      this.#options.dispatcher.dispatch(claimOf(invocation));
      return { rerun: true };
    }
    const { message } = invocation;
    const problem = kernelProblem('STORAGE_CONFLICT', {
      correlationId: message.correlationId, messageId: message.id,
      detail: `the unit conflicted ${invocation.conflicts + 1} times in one attempt`,
    });
    return { rerun: false, result: await this.failed(messageId, problem) };
  }

  laneReentrancy(caller: Message, laneKey: string): Problem | undefined {
    return laneReentrancyProblem(this.#options.connection, this.#inFlight, caller, laneKey);
  }

  // ADR 0083: messages a cancel ended hold no lane, slot, or deadline; the kernel host aborts running ones.
  forget(messageIds: Iterable<string>): void {
    for (const id of messageIds) {
      this.#inFlight.finish(id, false);
      this.#inFlight.releaseLane(id);
      this.#options.index.deadlines.forget(id);
    }
    this.#requestPump();
  }

  // Unstored deliveries (queued or running) whose event was published by one of `publishers` or that belong to
  // `correlationId`: they are in a cancel's scope although they have no row.
  unstoredInScope(publishers: ReadonlySet<string>, correlationId: string | undefined): string[] {
    const running = this.#inFlight.runningUnstored().map((invocation) => invocation.entry);
    return [...this.#options.index.queuedUnstored(), ...running]
      .filter(({ unstored }) => unstored !== undefined && ((unstored.publisher !== undefined && publishers.has(unstored.publisher)) || unstored.message.correlationId === correlationId))
      .map((entry) => entry.id);
  }

  // Unstored deliveries (queued or running) in a workspace being forgotten (04 §4.4).
  unstoredInWorkspace(workspaceId: string): string[] {
    const running = this.#inFlight.runningUnstored().map((invocation) => invocation.entry);
    return [...this.#options.index.queuedUnstored(), ...running].filter((entry) => entry.unstored !== undefined && entry.workspaceId === workspaceId).map((entry) => entry.id);
  }

  dropUnstored(ids: Iterable<string>): void {
    const dropped = new Set(ids);
    this.#options.index.remove(dropped);
    for (const id of dropped) this.#inFlight.finish(id, false);
    this.#requestPump();
  }

  // 03 §3.6: collateral of a stuck host returns to its place without an attempt penalty.
  async redeliver(messageId: string): Promise<void> {
    const { entry, message } = this.#running(messageId);
    const now = this.#options.now();
    if (entry.unstored === undefined) {
      const result = await this.#options.pipeline.enqueue(redeliveryUnit(message, entry.attempts, now));
      this.#options.onCommitted(result);
      if (!result.committed) return;
    }
    this.#inFlight.finish(messageId, true);
    this.#options.index.placeAtFront({ ...entry, notBefore: now, runnableSince: now });
    this.#requestPump();
  }

  // ADR 0084: a deferred command's deadline ends it while it waits.
  watchAwaiting(messageId: string, deadlineAt: number): void {
    this.#options.index.deadlines.watch(messageId, deadlineAt);
    this.#requestPump();
  }

  #dispatchQuery(query: AdmittedMessage): boolean {
    const { message, handler } = query;
    const load = this.#options.dispatcher.load({ extension: handler, workspaceId: message.workspaceId, kind: 'query' });
    if (load.inFlight >= load.cap) return false;
    const timeoutMs = this.#options.registry().handler(handler, `query:${message.type}`)?.timeoutMs;
    const deadlineAt = invocationDeadline(message, timeoutMs, this.#options.now());
    this.#options.dispatcher.dispatch({ message, extension: handler, handler: `query:${message.type}`, attempt: 1, stored: false, deadlineAt });
    return true;
  }

  async #expire(messageIds: string[]): Promise<void> {
    const result = await this.#options.pipeline.enqueue(expiryUnit(messageIds));
    this.#options.onCommitted(result);
    if (result.committed) this.forget(result.ended.map((ended) => ended.messageId));
  }

  // A pass on its own (timers, settled invocations) claims in its own transaction.
  #dispatchPending(now: number): void {
    const claimed: RunningInvocation[] = [];
    inWriteTransaction(this.#options.connection, () => this.#claimInto(claimed, now));
    this.#dispatchClaimed(claimed);
  }

  #claimInto(claimed: RunningInvocation[], now: number): void {
    const eligible = (entry: PendingEntry): boolean => this.#eligible(entry, now);
    const candidates = this.#options.index.candidates(now, eligible);
    if (candidates.length === 0) return;
    const { connection, files, index, dispatcher } = this.#options;
    const passDeps = {
      connection, files, index, dispatcher, rotation: this.#rotation, inFlight: this.#inFlight, eligible, undispatched: this.#batches.undispatched(),
      timeoutMs: (entry: PendingEntry) => this.#settings(entry).timeoutMs,
    };
    claimRunnable(passDeps, now, candidates, claimed);
  }

  #dispatchClaimed(claimed: readonly RunningInvocation[]): void {
    for (const invocation of claimed) {
      if (invocation.entry.unstored === undefined) this.#faults.reach('claim.after');
      this.#options.dispatcher.dispatch(claimOf(invocation));
    }
  }

  // A message whose deadline passed is left for expiry (ADR 0084); a quarantined extension's wait (ADR 0086), and so
  // do a disabled extension's until it is enabled again (06 §6.4).
  #eligible(entry: PendingEntry, now: number): boolean {
    const concurrency = this.#settings(entry).concurrency ?? schedulerDefaults.handlerConcurrency;
    const registry = this.#options.registry();
    return (entry.deadlineAt === undefined || entry.deadlineAt > now)
      && !registry.isQuarantined(entry.extension)
      && registry.isEnabled(entry.extension, entry.workspaceId)
      && this.#inFlight.laneFreeFor(entry)
      && this.#inFlight.handlerCount(entry.handlerKey) < concurrency
      && this.#inFlight.extensionCount(entry.extension) < schedulerDefaults.extensionConcurrency;
  }

  #settings(entry: PendingEntry): HandlerSettings {
    return this.#options.registry().handler(entry.extension, referenceOf(entry)) ?? {};
  }

  #running(messageId: string): RunningInvocation {
    const invocation = this.#inFlight.get(messageId);
    if (invocation === undefined) throw new UnknownInvocation(messageId);
    return invocation;
  }

  #requestPump(): void {
    if (this.#pumpRequested) return;
    this.#pumpRequested = true;
    queueMicrotask(() => this.pump());
  }

  #arm(now: number): void {
    const times = [this.#options.index.nextDue(), this.#options.index.deadlines.next()].filter((time) => time !== undefined);
    const due = times.length === 0 ? undefined : Math.min(...times);
    if (due === this.#wake?.at) return;
    this.#wake?.handle.cancel();
    this.#wake = due === undefined ? undefined : {
      at: due,
      handle: this.#options.timers.set(Math.max(0, due - now), () => {
        this.#wake = undefined;
        this.pump();
      }),
    };
  }
}

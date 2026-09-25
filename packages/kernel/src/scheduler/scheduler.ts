import type { Message, Problem } from '@kvman/protocol';
import { kernelProblem } from '../problems.ts';
import type { HandlerSettings, KernelRegistry } from '../registry/kernel-registry.ts';
import type { CommitPipeline } from '../storage/commit-pipeline.ts';
import type { AdmittedMessage, CommitResult } from '../storage/commit-unit.ts';
import type { Connection } from '../storage/driver.ts';
import { claimMessage } from './claims.ts';
import { commandSlots, type Claim, type Dispatcher } from './dispatcher.ts';
import { InFlight, type RunningInvocation } from './in-flight.ts';
import { causedBy } from './lane-reentrancy.ts';
import type { PendingIndex } from './pending-index.ts';
import { QueryQueue } from './query-queue.ts';
import { retryOutcome, retryUnit, schedulerDefaults } from './retry-policy.ts';
import { Rotation } from './rotation.ts';
import type { Candidate, PendingEntry } from './run-queues.ts';
import type { SchedulerTimers, TimerHandle } from './timers.ts';

export type SchedulerOptions = {
  connection: Connection;
  pipeline: CommitPipeline;
  index: PendingIndex;
  registry: () => KernelRegistry;
  dispatcher: Dispatcher;
  now: () => number;
  timers: SchedulerTimers;
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

function claimOf({ entry, message, attempt }: RunningInvocation): Claim {
  return { message, extension: entry.extension, handler: referenceOf(entry), attempt, stored: entry.unstored === undefined };
}

// 03 §3.4: picks runnable messages by class, workspace, and lane; enforces the limits; claims and dispatches them;
// fires timers; and settles failed attempts with retries and dead letters.
export class Scheduler {
  readonly #options: SchedulerOptions;
  readonly #inFlight = new InFlight();
  readonly #rotation = new Rotation();
  readonly #queries = new QueryQueue();
  #pumpRequested = false;
  #stopped = false;
  #wake: { at: number; handle: TimerHandle } | undefined;

  constructor(options: SchedulerOptions) {
    this.#options = options;
    options.index.onAdded(() => this.#requestPump());
  }

  // At boot, a lane whose message waits for its retry stays held so the rest of the lane stays behind it.
  start(): void {
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
    if (this.#stopped) return;
    const now = this.#options.now();
    this.#options.index.promoteDue(now);
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

  // 02 §2.6: waiting on a lane held by the caller or by a running ancestor would never end (ADR 0063).
  laneReentrancy(caller: Message, laneKey: string): Problem | undefined {
    const holder = this.#inFlight.runningHolder(laneKey);
    if (holder === undefined) return undefined;
    const heldByChain = holder.entry.id === caller.id || causedBy(this.#options.connection, caller, holder.entry.id);
    if (!heldByChain) return undefined;
    return kernelProblem('LANE_REENTRANT', {
      correlationId: caller.correlationId, messageId: caller.id,
      detail: `the target lane is held by ${holder.entry.id}, which is in this message's causation chain`,
      hint: 'send the command with onReply (a continuation) instead of waiting for it',
    });
  }

  #dispatchQuery(query: AdmittedMessage): boolean {
    const { message, handler } = query;
    const load = this.#options.dispatcher.load({ extension: handler, workspaceId: message.workspaceId, kind: 'query' });
    if (load.inFlight >= load.cap) return false;
    this.#options.dispatcher.dispatch({ message, extension: handler, handler: `query:${message.type}`, attempt: 1, stored: false });
    return true;
  }

  #dispatchPending(now: number): void {
    const { index } = this.#options;
    const eligible = (entry: PendingEntry): boolean => this.#eligible(entry);
    let candidates = index.candidates(now, eligible);
    for (let chosen = this.#rotation.choose(candidates); chosen !== undefined; chosen = this.#rotation.choose(candidates)) {
      const current: Candidate = chosen;
      candidates = candidates.filter((candidate) => candidate !== current);
      if (!eligible(current.entry) || !this.#hostHasRoom(current.entry)) continue;
      index.take(current);
      this.#rotation.served(current);
      this.#claim(current.entry, now);
      const next = current.queue.candidate(now, eligible);
      if (next !== undefined) candidates.push(next);
    }
  }

  #claim(entry: PendingEntry, now: number): void {
    const result = entry.unstored === undefined ? claimMessage(this.#options.connection, entry, now) : { claimed: true, message: entry.unstored } as const;
    if (!result.claimed) return;
    const invocation: RunningInvocation = { entry, message: result.message, attempt: entry.attempts + 1, conflicts: 0 };
    this.#inFlight.start(invocation);
    this.#options.dispatcher.dispatch(claimOf(invocation));
  }

  #eligible(entry: PendingEntry): boolean {
    const concurrency = this.#settings(entry).concurrency ?? schedulerDefaults.handlerConcurrency;
    return this.#inFlight.laneFreeFor(entry)
      && this.#inFlight.handlerCount(entry.handlerKey) < concurrency
      && this.#inFlight.extensionCount(entry.extension) < schedulerDefaults.extensionConcurrency;
  }

  #hostHasRoom(entry: PendingEntry): boolean {
    const load = this.#options.dispatcher.load({ extension: entry.extension, workspaceId: entry.workspaceId, kind: entry.kind });
    return load.inFlight < commandSlots(load.cap);
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
    const due = this.#options.index.nextDue();
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

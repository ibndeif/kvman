import type { AbortReason } from '@kvman/protocol';
import type { SchedulerTimers, TimerHandle } from '../scheduler/timers.ts';
import type { ActiveInvocation } from './active-invocation.ts';
import { stuckGraceMs, type Aborted } from './aborted-invocations.ts';
import type { PoolWorker } from './worker-pool.ts';

// The invocations sent to hosts: those running, each with its deadline timer, and those aborted but not yet settled,
// each with its stuck grace (ADR 0084).
export class RunningInvocations {
  readonly #timers: SchedulerTimers;
  readonly #active = new Map<string, ActiveInvocation>();
  readonly #deadlines = new Map<string, TimerHandle>();
  readonly #aborted = new Map<string, Aborted>();

  constructor(timers: SchedulerTimers) {
    this.#timers = timers;
  }

  get size(): number {
    return this.#active.size;
  }

  start(invocation: ActiveInvocation, delayMs: number, deadlineReached: () => void): void {
    this.#active.set(invocation.id, invocation);
    this.#deadlines.set(invocation.id, this.#timers.set(delayMs, deadlineReached));
  }

  // The invocation with this id while it runs on this worker.
  on(worker: PoolWorker, invocationId: string): ActiveInvocation | undefined {
    const invocation = this.#active.get(invocationId);
    return invocation?.worker === worker ? invocation : undefined;
  }

  isRunning(invocation: ActiveInvocation): boolean {
    return this.#active.get(invocation.id) === invocation;
  }

  all(): ActiveInvocation[] {
    return [...this.#active.values()];
  }

  runningOn(worker: PoolWorker): ActiveInvocation[] {
    return this.all().filter((invocation) => invocation.worker === worker);
  }

  end(invocation: ActiveInvocation): void {
    this.#active.delete(invocation.id);
    this.#deadlines.get(invocation.id)?.cancel();
    this.#deadlines.delete(invocation.id);
  }

  // Ends the invocation and waits the stuck grace for its host to settle it.
  abort(invocation: ActiveInvocation, reason: AbortReason, stuck: () => void): void {
    this.end(invocation);
    this.#aborted.set(invocation.id, { invocation, reason, grace: this.#timers.set(stuckGraceMs, stuck) });
  }

  abortedOn(worker: PoolWorker, invocationId: string): Aborted | undefined {
    const aborted = this.#aborted.get(invocationId);
    return aborted?.invocation.worker === worker ? aborted : undefined;
  }

  isAborted(invocation: ActiveInvocation): boolean {
    return this.#aborted.get(invocation.id)?.invocation === invocation;
  }

  // The aborted invocation settled after all: its grace ends.
  settled(aborted: Aborted): void {
    aborted.grace.cancel();
    this.#aborted.delete(aborted.invocation.id);
  }

  forgetAborted(worker: PoolWorker): void {
    for (const aborted of [...this.#aborted.values()].filter((candidate) => candidate.invocation.worker === worker)) this.settled(aborted);
  }

  cancelTimers(): void {
    for (const timer of [...this.#deadlines.values(), ...[...this.#aborted.values()].map((aborted) => aborted.grace)]) timer.cancel();
  }
}

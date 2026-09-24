import type { Claim, Dispatcher, DispatchTarget, HostLoad, SchedulerTimers, TimerHandle } from '../../src/index.ts';

export const startTime = 1_790_000_000_000;

export type TestTime = { value: number };

type PendingTimer = { at: number; fire: () => void; cancelled: boolean };

// Wake-ups the test fires by moving time forward; a restarted scheduler gets a fresh set on the same time.
export class ManualTimers implements SchedulerTimers {
  readonly #time: TestTime;
  readonly #timers: PendingTimer[] = [];

  constructor(time: TestTime) {
    this.#time = time;
  }

  set(delayMs: number, fire: () => void): TimerHandle {
    const timer: PendingTimer = { at: this.#time.value + delayMs, fire, cancelled: false };
    this.#timers.push(timer);
    return { cancel: () => { timer.cancelled = true; } };
  }

  armed(): number[] {
    return this.#timers.filter((timer) => !timer.cancelled).map((timer) => timer.at).sort((left, right) => left - right);
  }

  advance(milliseconds: number): void {
    const target = this.#time.value + milliseconds;
    for (let due = this.#nextDue(target); due !== undefined; due = this.#nextDue(target)) {
      this.#time.value = due.at;
      due.cancelled = true;
      due.fire();
    }
    this.#time.value = target;
  }

  #nextDue(target: number): PendingTimer | undefined {
    return this.#timers.filter((timer) => !timer.cancelled && timer.at <= target).sort((left, right) => left.at - right.at)[0];
  }
}

// One host per extension. The test sets how many command slots a host has (the cap keeps a quarter for queries,
// ADR 0060) and ends invocations itself.
export class TestDispatcher implements Dispatcher {
  readonly claims: Claim[] = [];
  readonly #caps = new Map<string, number>();
  readonly #running = new Map<string, string>();

  setCap(extension: string, cap: number): void {
    this.#caps.set(extension, cap);
  }

  // The smallest cap whose command share is `slots`.
  setCommandSlots(extension: string, slots: number): void {
    this.setCap(extension, Math.ceil((slots * 4) / 3));
  }

  load(target: DispatchTarget): HostLoad {
    const inFlight = [...this.#running.values()].filter((host) => host === target.extension).length;
    return { host: target.extension, inFlight, cap: this.#caps.get(target.extension) ?? 1000 };
  }

  dispatch(claim: Claim): void {
    this.claims.push(claim);
    this.#running.set(claim.message.id, claim.extension);
  }

  end(messageId: string): void {
    this.#running.delete(messageId);
  }

  claimedIds(): string[] {
    return this.claims.map((claim) => claim.message.id);
  }

  running(): string[] {
    return [...this.#running.keys()];
  }
}

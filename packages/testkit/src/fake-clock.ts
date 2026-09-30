import type { Clock } from '@kvman/kernel';

/** The test kernel's clock: it moves only when a test advances it. */
export type TestClock = {
  /** The current fake time, in milliseconds since the epoch. */
  now(): number;
  /** Moves the time forward, firing due retries and schedules, and resolves once no job is running or due. */
  advance(milliseconds: number): Promise<void>;
};

type Timer = { at: number; order: number; run: () => void };

export type FakeClock = { kernelClock: Clock; testClock: TestClock; settleWith(settle: () => Promise<void>): void; moveWhileStopped(milliseconds: number): void };

// Each advance fires the due timers one by one, letting the kernel settle after each, so work that a timer starts and
// the timers that work sets (a retry's backoff, a cron's next run) are seen within the same advance (ADR 0009, 15).
export function createFakeClock(start: number): FakeClock {
  let time = start;
  let order = 0;
  let timers: Timer[] = [];
  let settle: () => Promise<void> = async () => undefined;
  const nextDue = (until: number): Timer | undefined =>
    timers.filter((timer) => timer.at <= until).sort((left, right) => left.at - right.at || left.order - right.order)[0];
  const kernelClock: Clock = {
    now: () => time,
    setTimer: (delayMs, run) => {
      order += 1;
      const timer = { at: time + delayMs, order, run };
      timers.push(timer);
      return () => {
        timers = timers.filter((entry) => entry !== timer);
      };
    },
  };
  return {
    kernelClock,
    testClock: {
      now: () => time,
      advance: async (milliseconds) => {
        const target = time + milliseconds;
        await settle();
        for (let timer = nextDue(target); timer !== undefined; timer = nextDue(target)) {
          const due = timer;
          timers = timers.filter((entry) => entry !== due);
          time = due.at;
          due.run();
          await settle();
        }
        time = target;
        await settle();
      },
    },
    settleWith: (next) => {
      settle = next;
    },
    // A stopped kernel has cancelled its timers, so the time simply moves.
    moveWhileStopped: (milliseconds) => {
      time += milliseconds;
    },
  };
}

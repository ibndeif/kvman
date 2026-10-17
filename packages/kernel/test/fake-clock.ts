import type { Clock } from '../src/clock.ts';

export type FakeClock = Clock & { advance(milliseconds: number): void };

export function fakeClock(start = Date.parse('2026-09-30T03:00:00.000Z')): FakeClock {
  let time = start;
  return {
    now: () => time,
    setTimer: () => () => undefined,
    advance: (milliseconds) => {
      time += milliseconds;
    },
  };
}

export type TimerClock = Clock & { advance(milliseconds: number): void };

// A fake clock whose timers run when `advance` passes their time, earliest first.
export function timerClock(start = Date.parse('2026-09-30T03:00:00.000Z')): TimerClock {
  let time = start;
  let timers: { at: number; run: () => void }[] = [];
  return {
    now: () => time,
    setTimer: (delayMs, run) => {
      const timer = { at: time + delayMs, run };
      timers.push(timer);
      return () => {
        timers = timers.filter((other) => other !== timer);
      };
    },
    advance: (milliseconds) => {
      time += milliseconds;
      for (;;) {
        const due = timers.filter((timer) => timer.at <= time).sort((a, b) => a.at - b.at)[0];
        if (due === undefined) return;
        timers = timers.filter((other) => other !== due);
        due.run();
      }
    },
  };
}

// A deterministic random source: each call fills the bytes from a counter.
export function countingRandom(): (bytes: Uint8Array) => void {
  let next = 0;
  return (bytes) => {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = next & 0xff;
      next += 1;
    }
  };
}

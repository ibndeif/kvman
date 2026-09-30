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

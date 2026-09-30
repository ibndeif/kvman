// The kernel's source of time and its timers: retries, schedules, and retention wait on it. Tests inject a fake one
// that moves only when told (plan 10).

export type CancelTimer = () => void;

export type Clock = {
  now(): number;
  setTimer(delayMs: number, run: () => void): CancelTimer;
};

export const systemClock: Clock = {
  now: () => Date.now(),
  setTimer: (delayMs, run) => {
    const timer = setTimeout(run, delayMs);
    return () => clearTimeout(timer);
  },
};

export function isoTime(clock: Clock): string {
  return new Date(clock.now()).toISOString();
}

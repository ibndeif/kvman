// The kernel's source of time; tests inject a fake one (plan 10).
export type Clock = { now(): number };

export const systemClock: Clock = { now: () => Date.now() };

export function isoTime(clock: Clock): string {
  return new Date(clock.now()).toISOString();
}

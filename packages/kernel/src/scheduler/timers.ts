export type TimerHandle = { cancel(): void };

// The scheduler's wake-ups, passed in so tests drive time themselves.
export interface SchedulerTimers {
  set(delayMs: number, fire: () => void): TimerHandle;
}

export const systemTimers: SchedulerTimers = {
  set(delayMs, fire) {
    const timer = setTimeout(fire, delayMs);
    timer.unref();
    return { cancel: () => clearTimeout(timer) };
  },
};

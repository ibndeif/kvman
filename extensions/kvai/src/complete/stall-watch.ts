// A silent stream (plan 07 §7.1, ADR 0096): no event for 300 s, before the first one or between two, aborts the call.

export const stallAfterMs = 300_000;

export type StallWatch = { signal: AbortSignal; mark(): void; stalled(): boolean; stop(): void };

/** Aborts its signal when `mark` hasn't been called for `afterMs`; `stop` ends it, so no timer outlives the call. */
export function stallWatch(afterMs: number = stallAfterMs): StallWatch {
  const controller = new AbortController();
  let timer = setTimeout(() => controller.abort(), afterMs);
  return {
    signal: controller.signal,
    mark: () => {
      if (controller.signal.aborted) return;
      clearTimeout(timer);
      timer = setTimeout(() => controller.abort(), afterMs);
    },
    stalled: () => controller.signal.aborted,
    stop: () => clearTimeout(timer),
  };
}

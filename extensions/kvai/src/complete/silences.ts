// How long a model's stream was silent (plan 07 §7.1, ADR 0094, 2): the time to its first event and its longest gap
// between events, logged as numbers so a cut-off for a silent stream can be chosen from real use.

export type Silences = { firstEventMs: number | null; longestGapMs: number; events: number };

/** Marks each stream event, and gives the silences so far. */
export function silenceMeter(now: () => number = Date.now): { mark(): void; silences(): Silences } {
  const started = now();
  let last = started;
  let first: number | null = null;
  let longest = 0;
  let events = 0;
  return {
    mark: () => {
      const at = now();
      if (first === null) first = at - started;
      else longest = Math.max(longest, at - last);
      last = at;
      events += 1;
    },
    silences: () => ({ firstEventMs: first, longestGapMs: longest, events }),
  };
}

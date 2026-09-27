import type { ScheduleEntry } from '@kvman/protocol';
import { nextCronOccurrence, parseCron } from './cron.ts';

const unitMs: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };

// A manifest duration (ADR 0016: `30s`, `1h`, `7d`) in milliseconds.
export function durationMs(duration: string): number {
  const unit = unitMs[duration.slice(-1)];
  const amount = Number(duration.slice(0, -1));
  if (unit === undefined || !Number.isInteger(amount) || amount < 1) throw new RangeError(`"${duration}" is not a duration`);
  return amount * unit;
}

// ADR 0144: the first occurrence strictly after `now`: `every` counts whole durations from the moment the schedule
// became active; `cron` takes the next matching local minute. Undefined only for a cron that stopped matching.
export function nextOccurrence(schedule: Pick<ScheduleEntry, 'every' | 'cron'>, anchorAt: number, now: number): number | undefined {
  if (schedule.every !== undefined) {
    const every = durationMs(schedule.every);
    const elapsed = Math.max(0, now - anchorAt);
    return anchorAt + (Math.floor(elapsed / every) + 1) * every;
  }
  const parsed = parseCron(schedule.cron ?? '');
  return parsed.ok ? nextCronOccurrence(parsed.cron, now) : undefined;
}

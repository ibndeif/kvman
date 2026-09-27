import { afterEach, describe, expect, it } from 'vitest';
import { nextCronOccurrence, parseCron, type CronExpression } from '../../src/index.ts';

const zoneBefore = process.env['TZ'];

afterEach(() => {
  if (zoneBefore === undefined) delete process.env['TZ'];
  else process.env['TZ'] = zoneBefore;
});

function cron(text: string): CronExpression {
  const parsed = parseCron(text);
  if (!parsed.ok) throw new Error(`${text}: ${parsed.issue.message}`);
  return parsed.cron;
}

function local(year: number, month: number, day: number, hour = 0, minute = 0): number {
  return new Date(year, month - 1, day, hour, minute).getTime();
}

// The next `count` occurrences after `from`, as local "YYYY-MM-DD HH:MM" texts.
function occurrences(text: string, from: number, count: number): string[] {
  const expression = cron(text);
  const found: string[] = [];
  let after = from;
  for (let index = 0; index < count; index += 1) {
    const next = nextCronOccurrence(expression, after);
    if (next === undefined) throw new Error(`${text} has no occurrence after ${new Date(after).toISOString()}`);
    const date = new Date(next);
    const pad = (value: number): string => String(value).padStart(2, '0');
    found.push(`${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`);
    after = next;
  }
  return found;
}

describe('cron expressions (ADR 0144)', () => {
  it('M2.7-E30 cron expressions parse and give their next occurrence', () => {
    process.env['TZ'] = 'UTC';
    expect(occurrences('*/15 * * * *', local(2026, 1, 1, 0, 7), 3)).toEqual(['2026-01-01 00:15', '2026-01-01 00:30', '2026-01-01 00:45']);
    expect(occurrences('0 9 * * mon-fri', local(2026, 1, 3, 12), 2)).toEqual(['2026-01-05 09:00', '2026-01-06 09:00']);
    expect(occurrences('0 0 1,15 * *', local(2026, 1, 2), 3)).toEqual(['2026-01-15 00:00', '2026-02-01 00:00', '2026-02-15 00:00']);
    expect(occurrences('30 2 * jan,jul sun', local(2026, 1, 30), 2)).toEqual(['2026-07-05 02:30', '2026-07-12 02:30']);
    expect(occurrences('0 12 * * 7', local(2026, 1, 1), 1)).toEqual(['2026-01-04 12:00']);
    expect(occurrences('5-20/5 8 * * *', local(2026, 1, 1), 5)).toEqual(['2026-01-01 08:05', '2026-01-01 08:10', '2026-01-01 08:15', '2026-01-01 08:20', '2026-01-02 08:05']);
    expect(occurrences('0 0 13 * fri', local(2026, 2, 1), 4)).toEqual(['2026-02-06 00:00', '2026-02-13 00:00', '2026-02-20 00:00', '2026-02-27 00:00']);
    expect(occurrences('0 0 13 * fri', local(2026, 3, 7), 2)).toEqual(['2026-03-13 00:00', '2026-03-20 00:00']);

    process.env['TZ'] = 'America/New_York';
    expect(occurrences('30 2 * * *', local(2026, 3, 7, 12), 2)).toEqual(['2026-03-09 02:30', '2026-03-10 02:30']);
    const repeated = occurrences('30 1 * * *', local(2026, 10, 31, 12), 2);
    expect(repeated).toEqual(['2026-11-01 01:30', '2026-11-02 01:30']);

    process.env['TZ'] = 'UTC';
    const invalid = ['* * * *', '* * * * * *', '60 * * * *', '* 24 * * *', '* * 0 * *', '* * * 13 *', '* * * * 8', '*/0 * * * *', '5-1 * * * *', 'foo * * * *', '0 0 30 2 *'];
    for (const text of invalid) {
      const parsed = parseCron(text);
      expect(parsed.ok, text).toBe(false);
      if (!parsed.ok) expect(parsed.issue.hint.length, text).toBeGreaterThan(0);
    }
  });
});

import { describe, expect, it } from 'vitest';
import { idSchema } from '@kvman/sdk';
import { createIdGenerator } from '../src/ids.ts';
import { countingRandom, fakeClock } from './fake-clock.ts';

describe('ids (ADR 0001, 43)', () => {
  it('M1.3-E18 ids are UUIDv7, deterministic, and ordered within one millisecond', () => {
    const first = createIdGenerator(fakeClock(), countingRandom());
    const second = createIdGenerator(fakeClock(), countingRandom());
    const made = Array.from({ length: 5000 }, () => first());
    expect(made.slice(0, 3)).toEqual(Array.from({ length: 3 }, () => second()));
    for (const id of made) expect(idSchema.safeParse(id).success, id).toBe(true);
    expect([...made].sort()).toEqual(made);
    expect(new Set(made).size).toBe(made.length);
    const timeHex = Date.parse('2026-09-30T03:00:00.000Z').toString(16).padStart(12, '0');
    expect(made[0]?.replaceAll('-', '').slice(0, 12)).toBe(timeHex);
  });
});

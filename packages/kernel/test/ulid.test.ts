import { ulidSchema } from '@kvman/protocol';
import { describe, expect, it } from 'vitest';
import { createUlidGenerator } from '../src/index.ts';

describe('ULIDs (plan 02 §2.2)', () => {
  it('M1.1-E20 ULIDs are valid and ordered', () => {
    let time = 1_790_000_000_000;
    const generator = createUlidGenerator(() => time, () => new Uint8Array(10).fill(0xff - 1));
    const sameMillisecond = [generator.next(), generator.next(), generator.next()];
    time += 1;
    const later = generator.next();
    for (const id of [...sameMillisecond, later]) expect(ulidSchema.safeParse(id).success, id).toBe(true);
    expect([...sameMillisecond].sort()).toEqual(sameMillisecond);
    expect(new Set(sameMillisecond).size).toBe(3);
    expect(later > (sameMillisecond[2] ?? '')).toBe(true);
  });
});

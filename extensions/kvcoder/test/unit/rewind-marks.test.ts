import { describe, expect, it } from 'vitest';
import { byOrder, type Copy } from '../../src/files/file-copies.ts';
import { markBelow } from '../../src/rewind/rewind-records.ts';
import { isAfter } from '../../src/rewind/rewind-target.ts';

// What came after a message (ADR 0118, 1 and 4): `atSeq` against the message's `seq`, a record from before ADR 0118 by
// its time, the order of a file's changes, and the marks of cleared and collapsed messages moved back.

const mark = { seq: 10, createdAt: '2026-11-04T10:00:00.000Z' };
const copy = (id: string, order: number | null, createdAt: string): Copy => ({ id, sessionId: 's', path: '/a', previous: null, kept: null, written: null, tooLarge: false, atSeq: null, order, turnId: null, undoes: null, undone: false, createdAt });

describe('what came after a message (ADR 0118)', () => {
  it('QA77-H12 the marks move back below the message, and to null at the first message', () => {
    expect(markBelow(15, 14)).toBe(13);
    expect(markBelow(14, 14)).toBe(13);
    expect(markBelow(13, 14)).toBe(13);
    expect(markBelow(null, 14)).toBeNull();
    expect(markBelow(3, 0)).toBeNull();
  });

  it('QA77-E10 a record with atSeq is after the message by it; one from before ADR 0118 by its time', () => {
    expect(isAfter(11, '2020-01-01T00:00:00.000Z', mark)).toBe(true);
    expect(isAfter(10, '2030-01-01T00:00:00.000Z', mark)).toBe(false);
    expect(isAfter(null, '2026-11-04T10:00:00.001Z', mark)).toBe(true);
    expect(isAfter(undefined, '2026-11-04T10:00:00.000Z', mark)).toBe(false);
  });

  it('QA77-E11 changes are ordered by the counter, older records first by time', () => {
    const at = '2026-11-04T10:00:00.000Z';
    const sorted = [copy('c', 1, at), copy('old-2', null, '2026-11-04T09:00:00.001Z'), copy('b', 0, at), copy('old-1', null, '2026-11-04T09:00:00.000Z')].sort(byOrder);
    expect(sorted.map((found) => found.id)).toEqual(['old-1', 'old-2', 'b', 'c']);
  });
});

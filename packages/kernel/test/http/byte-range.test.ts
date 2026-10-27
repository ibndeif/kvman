import { describe, expect, it } from 'vitest';
import { rangeOf } from '../../src/http/byte-range.ts';

describe('one byte range of a download (04 §4.1, ADR 0107, 13)', () => {
  it('M5.4-E9 the three forms, the end cut to the file, and what is unsatisfiable or whole', () => {
    expect(rangeOf('bytes=0-99', 1000)).toEqual({ kind: 'part', first: 0, last: 99 });
    expect(rangeOf('bytes=900-', 1000)).toEqual({ kind: 'part', first: 900, last: 999 });
    expect(rangeOf('bytes=-100', 1000)).toEqual({ kind: 'part', first: 900, last: 999 });
    expect(rangeOf('bytes=-5000', 1000)).toEqual({ kind: 'part', first: 0, last: 999 });
    expect(rangeOf('bytes=500-5000', 1000)).toEqual({ kind: 'part', first: 500, last: 999 });
    expect(rangeOf('bytes=1000-', 1000)).toEqual({ kind: 'unsatisfiable' });
    expect(rangeOf('bytes=-0', 1000)).toEqual({ kind: 'unsatisfiable' });
    expect(rangeOf('bytes=0-', 0)).toEqual({ kind: 'unsatisfiable' });
    for (const header of [undefined, '', 'bytes=0-1,5-9', 'items=0-9', 'bytes=9-1', 'bytes=-', 'bytes=a-b']) expect(rangeOf(header, 1000)).toEqual({ kind: 'whole' });
  });
});

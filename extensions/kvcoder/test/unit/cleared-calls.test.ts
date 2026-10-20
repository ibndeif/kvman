import { describe, expect, it } from 'vitest';
import { callName } from '../../src/calls/call-name.ts';
import { clearedPayload } from '../../src/turns/cleared-results.ts';

describe("an old call's long text cleared with its result (08 §8.1, ADR 0097, 4)", () => {
  it('QA65-E12 500 characters are kept, 501 are cleared, inside arrays and objects too, and other values stay', () => {
    expect(clearedPayload({ path: 'a.ts', content: 'k'.repeat(500), risky: false, lines: 3 })).toEqual({ path: 'a.ts', content: 'k'.repeat(500), risky: false, lines: 3 });
    expect(clearedPayload({ path: 'a.ts', content: 'c'.repeat(501) })).toEqual({ path: 'a.ts', content: '[cleared to save memory: 501 characters]' });
    expect(clearedPayload({ edits: [{ oldText: 'short', newText: 'n'.repeat(2000) }], nested: { notes: ['x', 'y'.repeat(600)] } })).toEqual({ edits: [{ oldText: 'short', newText: '[cleared to save memory: 2000 characters]' }], nested: { notes: ['x', '[cleared to save memory: 600 characters]'] } });
    expect(clearedPayload('p'.repeat(700))).toBe('[cleared to save memory: 700 characters]');
    expect(clearedPayload(null)).toBeNull();
  });

  it('QA65-E13 read-files is named by its paths where no card shows it', () => {
    expect(callName('fs', 'read-files', { files: [{ path: 'src/a.ts' }, { path: 'src/b.ts', fromLine: 4 }] })).toBe('fs read-files src/a.ts, src/b.ts');
    expect(callName('fs', 'read-files', { files: 'not a list' })).toBe('fs read-files');
  });
});

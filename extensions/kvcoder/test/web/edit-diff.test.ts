import { describe, expect, it } from 'vitest';
import { diffCounts, diffLines, textLines } from '../../web/src/edit-diff.ts';

const context = (text: string) => ({ kind: 'context' as const, text });
const removed = (text: string) => ({ kind: 'removed' as const, text });
const added = (text: string) => ({ kind: 'added' as const, text });

describe("an edit's diff (08 §8.7, ADR 0036, 4)", () => {
  it('QA48-H1 the lines both texts share at the start and the end are context, and the rest is removed, then added', () => {
    const lines = diffLines('a\nb\nc\nd\n', 'a\nB\nX\nd\n');
    expect(lines).toEqual([context('a'), removed('b'), removed('c'), added('B'), added('X'), context('d')]);
    expect(diffCounts(lines)).toEqual({ added: 2, removed: 2 });
  });

  it('QA48-E1 a one-line change is one removed and one added line, with no context', () => {
    expect(diffLines('x = 1', 'x = 2')).toEqual([removed('x = 1'), added('x = 2')]);
  });

  it('QA48-E2 at most 3 shared lines show on each side, the nearest to the change', () => {
    const before = '1\n2\n3\n4\n5\nold\n6\n7\n8\n9\n10\n';
    expect(diffLines(before, before.replace('old', 'new'))).toEqual([context('3'), context('4'), context('5'), removed('old'), added('new'), context('6'), context('7'), context('8')]);
  });

  it('QA48-E3 a line only added has no removed line, and a line only removed no added one', () => {
    expect(diffLines('a\nc\n', 'a\nb\nc\n')).toEqual([context('a'), added('b'), context('c')]);
    expect(diffLines('a\nb\nc\n', 'a\nc\n')).toEqual([context('a'), removed('b'), context('c')]);
    expect(diffLines('a\na\n', 'a\n')).toEqual([context('a'), removed('a')]);
  });

  it('QA48-E4 a missing last line break changes nothing', () => {
    expect(textLines('a\nb')).toEqual(['a', 'b']);
    expect(textLines('a\nb\n')).toEqual(['a', 'b']);
    expect(textLines('')).toEqual([]);
    expect(diffLines('a\nb', 'a\nb\n')).toEqual([context('a'), context('b')]);
  });
});

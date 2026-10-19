import { describe, expect, it } from 'vitest';
import { applyEdits } from '../../src/files/edit-text.ts';

const refused = (original: string, edits: { oldText: string; newText: string; replaceAll?: boolean }[], message: RegExp): void => {
  expect(() => applyEdits(original, edits)).toThrowError(expect.objectContaining({ problem: expect.objectContaining({ code: 'VALIDATION_FAILED', message: expect.stringMatching(message) as unknown }) as unknown }) as Error);
};

describe('applyEdits (08 §8.5, ADR 0009, 159)', () => {
  it('QA4-H3 changes only the named text and reports the line of the first change', () => {
    const edited = applyEdits('one\ntwo\nthree\nfour\nfive\n', [{ oldText: 'three', newText: '3' }]);
    expect(edited).toEqual({ text: 'one\ntwo\n3\nfour\nfive\n', replacements: 1, firstChangedLine: 3, lastChangedLine: 3 });
  });

  it('QA4-H4 matches every edit against the original file, whatever order they come in', () => {
    const edited = applyEdits('a b c', [
      { oldText: 'c', newText: 'b' },
      { oldText: 'a', newText: 'c' },
    ]);
    expect(edited).toEqual({ text: 'c b b', replacements: 2, firstChangedLine: 1, lastChangedLine: 1 });
  });

  it('QA4-H5 a CRLF file keeps its CRLF endings and its BOM, and a LF oldText matches', () => {
    const edited = applyEdits('﻿one\r\ntwo\r\nthree\r\n', [{ oldText: 'one\ntwo', newText: 'one\n2\nmore' }]);
    expect(edited.text).toBe('﻿one\r\n2\r\nmore\r\nthree\r\n');
    expect(applyEdits('one\ntwo\n', [{ oldText: 'two\r\n', newText: '2\r\n' }]).text).toBe('one\n2\n');
  });

  it('QA4-H5 the first line break decides a mixed file', () => {
    expect(applyEdits('a\nb\r\nc', [{ oldText: 'c', newText: 'd' }]).text).toBe('a\nb\nd');
    expect(applyEdits('a\r\nb\nc', [{ oldText: 'c', newText: 'd' }]).text).toBe('a\r\nb\r\nd');
  });

  it('QA4-E5 text that is not found names the edit, with the right index among several', () => {
    refused('abc', [{ oldText: 'zzz', newText: 'x' }], /^edits\[0\] was not found; oldText must match the file exactly/);
    refused('abc', [{ oldText: 'a', newText: 'x' }, { oldText: 'nope', newText: 'x' }], /^edits\[1\] was not found/);
    refused('a  b', [{ oldText: 'a b', newText: 'x' }], /was not found/);
  });

  it('QA4-E6 text found twice is refused, overlapping occurrences included', () => {
    refused('x = 1\nx = 1\n', [{ oldText: 'x = 1', newText: 'x = 2' }], /^edits\[0\] was found 2 times; add more surrounding text/);
    refused('aaa', [{ oldText: 'aa', newText: 'b' }], /was found 2 times/);
  });

  it('QA4-E7 overlapping edits are refused and name both', () => {
    refused('abcdef', [{ oldText: 'abcd', newText: '1' }, { oldText: 'cdef', newText: '2' }], /^edits\[0\] and edits\[1\] overlap; merge them/);
    refused('abcdef', [{ oldText: 'cdef', newText: '2' }, { oldText: 'abcd', newText: '1' }], /^edits\[1\] and edits\[0\] overlap/);
  });

  it('QA4-E8 an empty oldText is refused', () => {
    refused('abc', [{ oldText: '', newText: 'x' }], /^edits\[0\]\.oldText is empty/);
  });

  it('QA4-E9 an edit that changes nothing is refused', () => {
    refused('abc', [{ oldText: 'b', newText: 'b' }], /^The edits change nothing in the file/);
  });

  it('QA47-H4 every refusal says that nothing was written', () => {
    const refusals: [string, { oldText: string; newText: string }[]][] = [
      ['abc', [{ oldText: 'zzz', newText: 'x' }]],
      ['aaa', [{ oldText: 'aa', newText: 'b' }]],
      ['abcdef', [{ oldText: 'abcd', newText: '1' }, { oldText: 'cdef', newText: '2' }]],
      ['abc', [{ oldText: '', newText: 'x' }]],
      ['abc', [{ oldText: 'b', newText: 'b' }]],
    ];
    for (const [text, edits] of refusals) refused(text, edits, / Nothing was written\.$/);
  });
});

describe('applyEdits with replaceAll (08 §8.5, ADR 0090, 1)', () => {
  it('QA58-H1 replaceAll replaces every occurrence, and an edit without it still matches once', () => {
    const edited = applyEdits('x = 1\ny = 0\nx = 1\nx = 1\n', [{ oldText: 'x = 1', newText: 'x = 2', replaceAll: true }, { oldText: 'y = 0', newText: 'y = 9' }]);
    expect(edited).toEqual({ text: 'x = 2\ny = 9\nx = 2\nx = 2\n', replacements: 4, firstChangedLine: 1, lastChangedLine: 4 });
  });

  it('QA58-E1 replaceAll with nothing to replace is refused', () => {
    refused('abc', [{ oldText: 'zzz', newText: 'x', replaceAll: true }], /^edits\[0\] was not found;.* Nothing was written\.$/);
  });

  it('QA58-E2 replaceAll finds occurrences left to right, as String.replaceAll does', () => {
    expect(applyEdits('aaaa', [{ oldText: 'aa', newText: 'b', replaceAll: true }])).toMatchObject({ text: 'bb', replacements: 2 });
  });

  it('QA58-E3 an occurrence that overlaps another edit is refused, naming both', () => {
    refused('ab ab', [{ oldText: 'ab', newText: 'x', replaceAll: true }, { oldText: 'b ab', newText: 'y' }], /^edits\[\d\] and edits\[\d\] overlap/);
  });

  it('QA58-E4 replaceAll that changes nothing is refused', () => {
    refused('a a a', [{ oldText: 'a', newText: 'a', replaceAll: true }], /^The edits change nothing in the file\./);
  });

  it('QA58-H1 a repeated text without replaceAll says how to replace every one', () => {
    refused('x\nx\n', [{ oldText: 'x', newText: 'y' }], /was found 2 times; add more surrounding text so it matches once, or set replaceAll to replace every one\./);
  });
});

import { describe, expect, it } from 'vitest';
import { applyEdits } from '../../src/files/edit-text.ts';

const refused = (original: string, edits: { oldText: string; newText: string }[], message: RegExp): void => {
  expect(() => applyEdits(original, edits)).toThrowError(expect.objectContaining({ problem: expect.objectContaining({ code: 'VALIDATION_FAILED', message: expect.stringMatching(message) as unknown }) as unknown }) as Error);
};

describe('applyEdits (08 §8.5, ADR 0009, 159)', () => {
  it('QA4-H3 changes only the named text and reports the line of the first change', () => {
    const edited = applyEdits('one\ntwo\nthree\nfour\nfive\n', [{ oldText: 'three', newText: '3' }]);
    expect(edited).toEqual({ text: 'one\ntwo\n3\nfour\nfive\n', replacements: 1, firstChangedLine: 3 });
  });

  it('QA4-H4 matches every edit against the original file, whatever order they come in', () => {
    const edited = applyEdits('a b c', [
      { oldText: 'c', newText: 'b' },
      { oldText: 'a', newText: 'c' },
    ]);
    expect(edited).toEqual({ text: 'c b b', replacements: 2, firstChangedLine: 1 });
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
});

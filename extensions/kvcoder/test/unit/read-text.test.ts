import { describe, expect, it } from 'vitest';
import { editText, filesEntryText, readText } from '../../src/files/read-text.ts';

const read = (fields: Partial<Parameters<typeof readText>[0]> = {}) => ({ path: 'src/app.ts', fromLine: 1, totalLines: 3, content: 'import x from "y";\n\nexport function f() {\n', truncated: false, ...fields });

describe('a read as the model reads it (08 §8.5, ADR 0097, 2)', () => {
  it('QA65-H4 a header, then each line numbered as cat -n prints it, and where to read on', () => {
    expect(readText(read())).toBe('src/app.ts · lines 1–3 of 3\n     1\timport x from "y";\n     2\t\n     3\texport function f() {');
    expect(readText(read({ fromLine: 4, totalLines: 950, content: 'a\nb\n', truncated: true, next: { fromLine: 6 } }))).toBe('src/app.ts · lines 4–5 of 950 · read on with fromLine 6\n     4\ta\n     5\tb');
    expect(readText(read({ fromLine: 123456, totalLines: 999999, content: 'deep\n' }))).toBe('src/app.ts · line 123456 of 999999\n123456\tdeep');
  });

  it('QA65-E6 an empty file, a line past the end, one line, a read from a column, a cut long line, and CRLF lines', () => {
    expect(readText(read({ totalLines: 0, content: '' }))).toBe('src/app.ts · empty (0 lines)');
    expect(readText(read({ fromLine: 9, content: '' }))).toBe('src/app.ts · no lines from line 9: the file has 3 lines');
    expect(readText(read({ fromLine: 9, totalLines: 1, content: '' }))).toBe('src/app.ts · no lines from line 9: the file has 1 line');
    expect(readText(read({ fromLine: 2, content: 'two' }))).toBe('src/app.ts · line 2 of 3\n     2\ttwo');
    expect(readText(read({ content: 'tail\nnext\n' }), 400)).toBe('src/app.ts · lines 1–2 of 3 (line 1 from character 400)\n     1\ttail\n     2\tnext');
    expect(readText(read({ totalLines: 1, content: 'hhh', truncated: true, next: { fromLine: 1, fromColumn: 4 } }))).toBe('src/app.ts · line 1 of 1 · read on with fromLine 1, fromColumn 4\n     1\thhh');
    expect(readText(read({ totalLines: 2, content: 'one\r\ntwo\r\n' }))).toBe('src/app.ts · lines 1–2 of 2\n     1\tone\n     2\ttwo');
  });

  it("QA65-H2 each file of read-files: its read, its error, that it wasn't read, or that the chat holds it", () => {
    expect(filesEntryText(read())).toBe(readText(read()));
    expect(filesEntryText({ path: 'gone.ts', error: { code: 'NOT_FOUND', message: "gone.ts doesn't exist." } })).toBe("gone.ts · error NOT_FOUND: gone.ts doesn't exist.");
    expect(filesEntryText({ path: 'late.ts', notRead: true })).toBe("late.ts · not read: the files before it used this call's 30 KB; read it in another call");
    expect(filesEntryText({ path: 'held.ts', unchanged: true })).toBe('held.ts is unchanged since you read these lines earlier in this conversation; that result is above.');
  });
});

describe('an edit as the model reads it (08 §8.5, ADR 0097, 2)', () => {
  it('QA65-H5 the changed lines numbered, and a long change whose marker is unnumbered and skips its lines', () => {
    expect(editText({ path: 'a.ts', replacements: 1, fromLine: 7, content: 'x\ny\n' })).toBe('a.ts · 1 replacement · lines 7–8 now read:\n     7\tx\n     8\ty');
    expect(editText({ path: 'a.ts', replacements: 2, fromLine: 7, content: 'x\n' })).toBe('a.ts · 2 replacements · line 7 now reads:\n     7\tx');
    const shown = ['1\n', '2\n', '3\n', '4\n', '5\n', '6\n', '[… 8 lines not shown …]\n', '15\n', '16\n', '17\n', '18\n', '19\n', '20\n'].join('');
    const text = editText({ path: 'a.ts', replacements: 1, fromLine: 1, content: shown, skipped: { afterLine: 6, lines: 8 } }).split('\n');
    expect(text[0]).toBe('a.ts · 1 replacement · lines 1–20 now read:');
    expect(text.slice(6, 9)).toEqual(['     6\t6', '[… 8 lines not shown …]', '    15\t15']);
    expect(text.at(-1)).toBe('    20\t20');
  });
});

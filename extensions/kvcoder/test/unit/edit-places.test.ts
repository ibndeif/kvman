import { ProblemError } from '@kvman/sdk';
import { describe, expect, it } from 'vitest';
import { applyEdits } from '../../src/files/edit-text.ts';

// The message an edit fails with.
function refusal(content: string, oldText: string): string {
  try {
    applyEdits(content, [{ oldText, newText: 'changed' }]);
  } catch (error) {
    if (error instanceof ProblemError) return error.problem.message;
    throw error;
  }
  throw new Error('The edit was applied.');
}

const numbered = (from: number, lines: readonly string[]): string => lines.map((line, index) => `${String(from + index).padStart(6)}\t${line}`).join('\n');

describe('an edit that fails says where (08 §8.5, ADR 0097, 3)', () => {
  it('QA65-H6 found several times: the line of each match, and each shown with the line before and after', () => {
    const content = ['a', 'call()', 'b', 'c', 'call()', 'd', 'e', 'f', 'call()', 'g'].join('\n');
    const message = refusal(content, 'call()');
    expect(message.split('\n')[0]).toBe('edits[0] was found 3 times, at lines 2, 5, 9; add more surrounding text so it matches once, or set replaceAll to replace every one. Nothing was written.');
    expect(message.split('\n').slice(1).join('\n')).toBe([numbered(1, ['a', 'call()', 'b']), numbered(4, ['c', 'call()', 'd']), numbered(8, ['f', 'call()', 'g'])].join('\n\n'));
  });

  it('QA65-H7 not found, but it matches when whitespace is ignored: those lines are shown', () => {
    const content = 'function f() {\n\tif (x) {\n\t\treturn 1;\n\t}\n}\n';
    const message = refusal(content, 'if (x) {\n    return 1;\n  }');
    expect(message.split('\n')[0]).toBe("edits[0] was not found; oldText must match the file exactly, including whitespace and line breaks. It matches when whitespace is ignored at lines 2–4; the file's lines there are below. Nothing was written.");
    expect(message.split('\n').slice(1).join('\n')).toBe(numbered(2, ['\tif (x) {', '\t\treturn 1;', '\t}']));
  });

  it("QA65-H8 not found even loosely: where its first line appears, from the line before to as many lines as oldText has", () => {
    const content = ['const a = 1;', 'const total = sum(a);', 'log(total);', 'end();'].join('\n');
    const message = refusal(content, '  const total = sum(a);\nprint(total);');
    expect(message.split('\n')[0]).toBe("edits[0] was not found; oldText must match the file exactly, including whitespace and line breaks. Its first line appears at line 2; the file's lines there are below. Nothing was written.");
    expect(message.split('\n').slice(1).join('\n')).toBe(numbered(1, ['const a = 1;', 'const total = sum(a);', 'log(total);']));
  });

  it('QA65-E8 30 matches name the first 20 and how many more, show the first 5, and two on one line name it once', () => {
    const content = Array.from({ length: 30 }, () => 'go();').join('\n');
    const message = refusal(content, 'go();');
    expect(message.split('\n')[0]).toContain(`at lines ${Array.from({ length: 20 }, (_, index) => index + 1).join(', ')} and 10 more;`);
    // The first 5 matches' lines overlap, so they show once together: lines 1 to 6.
    expect(message.split('\n').slice(1)).toEqual(Array.from({ length: 6 }, (_, index) => `${String(index + 1).padStart(6)}\tgo();`));
    expect(refusal('x x\ny', 'x').split('\n')[0]).toContain('was found 2 times, at line 1;');
    expect(refusal('a\ncall()\ncall()\nb', 'call()').split('\n').slice(1)).toEqual(['     1\ta', '     2\tcall()', '     3\tcall()', '     4\tb']);
  });

  it("QA65-E9 nothing near says only the exact rule, and a first line in 5 places shows 3 and how many more", () => {
    expect(refusal('alpha\nbeta\n', 'gamma')).toBe('edits[0] was not found; oldText must match the file exactly, including whitespace and line breaks. Nothing was written.');
    const content = Array.from({ length: 5 }, (_, index) => `step();\nline${String(index)}`).join('\n');
    const message = refusal(content, 'step();\nnever');
    expect(message.split('\n')[0]).toContain('Its first line appears at lines 1, 3, 5 and 2 more;');
    // The three places' lines overlap, so they show once together.
    expect(message.split('\n').slice(1)).toHaveLength(6);
  });

  it('QA65-E10 a shown place holds at most 20 lines, and a line at most 200 characters', () => {
    const lines = Array.from({ length: 40 }, (_, index) => `row ${String(index)}`);
    const loose = refusal(lines.join('\n'), lines.join('\n  '));
    expect(loose.split('\n').slice(1)).toHaveLength(20);
    const wide = refusal(`${'w'.repeat(300)}\nwide\nwide`, 'wide');
    expect(wide).not.toContain('w'.repeat(201));
    expect(refusal(`${'w'.repeat(300)} key\nnext`, `${'w'.repeat(300)} key\nother`).split('\n')[1]).toBe(`     1\t${'w'.repeat(200)}…`);
  });
});

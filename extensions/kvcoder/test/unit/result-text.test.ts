import { describe, expect, it } from 'vitest';
import { errorOutput, jsonOutput } from '../../src/connector-call.ts';
import { plainEnvironment, plainText, resultLines, truncate } from '../../src/result-text.ts';

describe('call results (ADR 0009, 93)', () => {
  it('M2.4-E28 output over 30 KB keeps its first and last 15 KB around the marker', () => {
    const text = `${'a'.repeat(20_000)}${'m'.repeat(5_000)}${'z'.repeat(20_000)}`;
    const cut = truncate(text);
    expect(cut.startsWith(`${'a'.repeat(15_360)}\n[… ${45_000 - 30_720} bytes omitted …]\n`)).toBe(true);
    expect(cut.endsWith(`\n${'z'.repeat(15_360)}`)).toBe(true);
    expect(truncate('x'.repeat(30_720))).toBe('x'.repeat(30_720));
    expect(resultLines(cut, 0)).toBe(`${cut}\n[exit code 0]`);
  });

  it('M2.4-E152 colour, cursor, and title codes are removed, and tabs and new lines stay', () => {
    expect(plainText('\u001b[1m\u001b[31mFAIL\u001b[39m\u001b[22m a.test.ts\n\tline\u001b[2K\u001b[1A')).toBe('FAIL a.test.ts\n\tline');
    expect(plainText('\u001b]0;title\u0007done \u001b]8;;https://x.test\u001b\\link\u001b]8;;\u001b\\\u001b(B')).toBe('done link');
    expect(plainText('no codes [31m here')).toBe('no codes [31m here');
  });

  it('M2.4-E152 a command is asked for plain output unless the environment already chose', () => {
    expect(plainEnvironment({ PATH: '/bin' })).toEqual({ NO_COLOR: '1' });
    expect(plainEnvironment({ NO_COLOR: '0' })).toEqual({});
    expect(plainEnvironment({ FORCE_COLOR: '1' })).toEqual({});
  });

  it('M2.4-E28 results end with the exit code, and connector output is JSON with no indentation or an error line', () => {
    expect(resultLines('hi', 0)).toBe('hi\n[exit code 0]');
    expect(resultLines('', 3)).toBe('[exit code 3]');
    expect(resultLines('late', 124, ['[timed out after 1 s; the process tree was killed]'])).toBe('late\n[timed out after 1 s; the process tree was killed]\n[exit code 124]');
    expect(jsonOutput({ a: [1] })).toEqual({ output: '{"a":[1]}', exitCode: 0 });
    expect(errorOutput({ code: 'NOT_FOUND', message: 'No.' })).toEqual({ output: 'error NOT_FOUND: No.', exitCode: 1 });
  });
});

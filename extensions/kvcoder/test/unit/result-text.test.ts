import { describe, expect, it } from 'vitest';
import { errorOutput, jsonOutput } from '../../src/connector-call.ts';
import { resultLines, truncate } from '../../src/result-text.ts';

describe('call results (ADR 0009, 93)', () => {
  it('M2.4-E28 output over 30 KB keeps its first and last 15 KB around the marker', () => {
    const text = `${'a'.repeat(20_000)}${'m'.repeat(5_000)}${'z'.repeat(20_000)}`;
    const cut = truncate(text);
    expect(cut.startsWith(`${'a'.repeat(15_360)}\n[… ${45_000 - 30_720} bytes omitted …]\n`)).toBe(true);
    expect(cut.endsWith(`\n${'z'.repeat(15_360)}`)).toBe(true);
    expect(truncate('x'.repeat(30_720))).toBe('x'.repeat(30_720));
    expect(resultLines(cut, 0)).toBe(`${cut}\n[exit code 0]`);
  });

  it('M2.4-E28 results end with the exit code, and connector output is JSON with no indentation or an error line', () => {
    expect(resultLines('hi', 0)).toBe('hi\n[exit code 0]');
    expect(resultLines('', 3)).toBe('[exit code 3]');
    expect(resultLines('late', 124, ['[timed out after 1 s; the process tree was killed]'])).toBe('late\n[timed out after 1 s; the process tree was killed]\n[exit code 124]');
    expect(jsonOutput({ a: [1] })).toEqual({ output: '{"a":[1]}', exitCode: 0 });
    expect(errorOutput({ code: 'NOT_FOUND', message: 'No.' })).toEqual({ output: 'error NOT_FOUND: No.', exitCode: 1 });
  });
});

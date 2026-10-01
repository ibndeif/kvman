import { describe, expect, it } from 'vitest';
import { checkFindings, outputTail, outputTailLimit, typeScriptFindings } from '../../src/ext/findings.ts';

describe('ext check findings and ext test output (ADR 0009, 117, 126)', () => {
  it('M2.5-E11 TypeScript lines become file:line:col findings, continuations join, other lines are ignored', () => {
    const output = [
      "src/index.ts(12,5): error TS2322: Type 'number' is not assignable to type 'string'.",
      "test\\extension.test.ts(3,1): error TS2345: Argument of type '{}' is not assignable to parameter of type 'X'.",
      "  Property 'text' is missing in type '{}' but required in type 'X'.",
      "error TS5023: Unknown compiler option 'nope'.",
      'Found 3 errors.',
    ].join('\n');
    expect(typeScriptFindings(output)).toEqual([
      { file: 'src/index.ts:12:5', message: "TS2322: Type 'number' is not assignable to type 'string'.", hint: expect.any(String) },
      { file: 'test/extension.test.ts:3:1', message: "TS2345: Argument of type '{}' is not assignable to parameter of type 'X'.\nProperty 'text' is missing in type '{}' but required in type 'X'.", hint: expect.any(String) },
      { message: "TS5023: Unknown compiler option 'nope'.", hint: expect.any(String) },
    ]);
  });

  it("M2.5-E11 a check's findings are read from its output's last line", () => {
    const stdout = '\n> notes@0.1.0 check\n> kvman-check --json\n\n[{"file":"locales/ar.json","message":"m","hint":"h"},{"message":"n","hint":"i"}]\n';
    expect(checkFindings(stdout)).toEqual([{ file: 'locales/ar.json', message: 'm', hint: 'h' }, { message: 'n', hint: 'i' }]);
    expect(checkFindings('npm error Missing script: "check"')).toBeUndefined();
    expect(checkFindings('{"not":"an array"}')).toBeUndefined();
  });

  it('M2.5-E12 the output cut keeps the last 30 KB and marks the cut', () => {
    expect(outputTail('short')).toBe('short');
    const long = `${'a'.repeat(1000)}${'b'.repeat(outputTailLimit)}`;
    expect(outputTail(long)).toBe(`[… the first 1000 bytes were cut …]\n${'b'.repeat(outputTailLimit)}`);
  });
});

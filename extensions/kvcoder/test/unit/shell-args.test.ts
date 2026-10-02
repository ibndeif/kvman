import { describe, expect, it } from 'vitest';
import { parseShellArgs } from '../../src/calls/shell-tool.ts';

const call = { description: 'Lists the files in the workspace folder.', command: 'ls', risky: false };

function titleOf(args: Parameters<typeof parseShellArgs>[0]): string | undefined {
  const parsed = parseShellArgs(args);
  return parsed.success ? parsed.data.title : undefined;
}

function problemsOf(args: Parameters<typeof parseShellArgs>[0]): string {
  const parsed = parseShellArgs(args);
  return parsed.success ? '' : parsed.problems;
}

describe("a shell call's arguments (08 §8.2, ADR 0009, 186)", () => {
  it('QA7-H4 the same call with its own title keeps it', () => {
    expect(titleOf({ ...call, title: 'List the files' })).toBe('List the files');
  });

  it('QA7-H2 a missing or blank title is derived from the description', () => {
    expect(titleOf(call)).toBe('Lists the files in the workspace folder.');
    for (const title of ['', '   ', '\n']) expect(titleOf({ ...call, title }), JSON.stringify(title)).toBe('Lists the files in the workspace folder.');
  });

  it('QA7-H3 a description of 60 characters or fewer is the whole title, a longer one is cut at 60 and marked', () => {
    const sixty = 'a'.repeat(60);
    expect(titleOf({ ...call, description: `  ${sixty}  ` })).toBe(sixty);
    expect(titleOf({ ...call, description: `${sixty}b` })).toBe(`${sixty}…`);
  });

  it('QA7-H6 each argument error says what the field must be', () => {
    expect(problemsOf({ ...call, description: undefined as never })).toMatch(/^title: .*\(it must be two to six words in the imperative, for the person\); description: .*\(it must be one sentence saying what the command does and why, for the person\)$/);
    expect(problemsOf({ ...call, command: 5 })).toMatch(/^command: .*\(it must be the command to run\)$/);
    expect(problemsOf({ ...call, risky: 'no' })).toMatch(/^risky: .*\(it must be true or false: true when the call could lose or damage something that isn't your own work, or reaches outside the workspace\)$/);
    expect(problemsOf({ ...call, mode: 'fast' })).toMatch(/^mode: .*\(it must be "sync" or "async"\)$/);
    expect(problemsOf({ ...call, timeoutMs: -1 })).toMatch(/^timeoutMs: .*\(it must be a positive whole number of milliseconds\)$/);
  });

  it('QA7-E1 with no description there is nothing to derive from: both are named', () => {
    const problems = problemsOf({ command: 'ls', risky: false });
    expect(problems).toMatch(/^title: /);
    expect(problems).toContain('; description: ');
    expect(problemsOf({ description: '', command: 'ls', risky: false })).toMatch(/^title: .*; description: /);
  });

  it('QA7-E2 risky is never defaulted', () => {
    expect(problemsOf({ title: 'List', description: 'Lists.', command: 'ls' })).toMatch(/^risky: /);
  });
});

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
    expect(problemsOf({ ...call, command: 5 })).toMatch(/^command: .*\(it must be the command to run\)$/);
    expect(problemsOf({ ...call, risky: 'no' })).toMatch(/^risky: .*\(it must be true or false: true when the call could lose or damage something that isn't your own work, or reaches outside the workspace\)$/);
    expect(problemsOf({ ...call, mode: 'fast' })).toMatch(/^mode: .*\(it must be "sync" or "async"\)$/);
    expect(problemsOf({ ...call, timeoutMs: -1 })).toMatch(/^timeoutMs: .*\(it must be a positive whole number of milliseconds\)$/);
  });

  it('QA11-H3 a blank title and description are missing, and a call with neither parses', () => {
    const bare = parseShellArgs({ command: 'ls' });
    expect(bare).toEqual({ success: true, data: { command: 'ls', risky: true } });
    const blank = parseShellArgs({ title: '  ', description: '', command: 'ls', risky: false });
    expect(blank).toEqual({ success: true, data: { command: 'ls', risky: false } });
    expect(titleOf({ title: '  ', description: 'Lists the files.', command: 'ls' })).toBe('Lists the files.');
  });

  it('QA11-E1 command is still required, and the error ends by asking for the call again', () => {
    for (const args of [{ title: 'List', description: 'Lists.', risky: false }, { title: 'List', command: '', risky: false }]) {
      expect(problemsOf(args), JSON.stringify(args)).toMatch(/^command: .*\(it must be the command to run\)$/);
    }
  });

  it('QA11-E2 a wrong type is still an error naming the field', () => {
    expect(problemsOf({ ...call, title: 5 })).toMatch(/^title: /);
    expect(problemsOf({ ...call, description: false })).toMatch(/^description: /);
  });

  it('QA11-E3 risky false is kept, and a missing risky counts as true', () => {
    const kept = parseShellArgs({ ...call, risky: false });
    expect(kept.success && kept.data.risky).toBe(false);
    const missing = parseShellArgs({ command: 'ls', title: 'List', description: 'Lists.' });
    expect(missing.success && missing.data.risky).toBe(true);
  });
});

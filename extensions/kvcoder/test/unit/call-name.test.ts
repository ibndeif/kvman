import { describe, expect, it } from 'vitest';
import { callName } from '../../src/calls/call-name.ts';
import { runCallSchema } from '../../src/schemas/records.ts';

describe('a call named from itself (08 §8.5, ADR 0089, 1)', () => {
  it('QA57-E3 each kind of call is named by its connector, command, and subject', () => {
    expect(callName('shell', 'exec', { line: 'npm test', risky: false })).toBe('shell exec npm test');
    expect(callName('node', 'exec', { args: '--version', risky: false })).toBe('node exec node --version');
    expect(callName('node', 'exec', { risky: false })).toBe('node exec node');
    expect(callName('fs', 'read', { path: 'src/app.ts' })).toBe('fs read src/app.ts');
    expect(callName('fs', 'search', { pattern: 'TODO', path: 'src' })).toBe('fs search TODO');
    expect(callName('delegate', 'run', { worker: 'general', title: 'Node.js expert', kind: 'find', goal: 'Find the leak.', done: 'It is done.' })).toBe('delegate run general · Node.js expert');
    expect(callName('mcp', 'run', { server: 'browser', steps: [{ tool: 'open' }, { tool: 'click' }], risky: false })).toBe('mcp run browser · open, click');
    expect(callName('mcp', 'call', { server: 'docs', tool: 'search', risky: false })).toBe('mcp call docs · search');
    expect(callName('fs', 'help', { command: 'edit' })).toBe('fs help edit');
    expect(callName('background', 'wait', { id: 'job-1' })).toBe('background wait job-1');
    expect(callName('execution-map', 'get', {})).toBe('execution-map get');
  });

  it('QA57-E4 a long call of several lines is named on one line of 200 characters', () => {
    const line = `cat <<'EOF' > notes.txt\n${'a'.repeat(300)}\nEOF`;
    const name = callName('shell', 'exec', { line, risky: false });
    expect(name).not.toContain('\n');
    expect(name).toBe(`${`shell exec cat <<'EOF' > notes.txt ${'a'.repeat(300)}`.slice(0, 200)}…`);
  });

  it('QA57-E2 a stored call with a description still parses, one without parses, and another field still fails', () => {
    const call = { connector: 'shell', command: 'exec', payload: { line: 'touch a', risky: true } };
    expect(runCallSchema.parse(call)).toEqual(call);
    expect(runCallSchema.parse({ description: 'Make a file.', ...call })).toEqual({ description: 'Make a file.', ...call });
    expect(runCallSchema.safeParse({ ...call, extra: true }).success).toBe(false);
  });
});

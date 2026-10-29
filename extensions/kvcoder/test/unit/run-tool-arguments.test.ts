import { describe, expect, it } from 'vitest';
import { buildPrompt } from '../../src/prompt/build-prompt.ts';
import { expandedCalls, parseRunArgs, repairedArguments, runTool } from '../../src/calls/run-tool.ts';

describe('the run tool has no description (08 §8.2, ADR 0089, 1)', () => {
  it('QA57-H1 run takes connector, command, and payload, and the prompt says so', () => {
    const tool = runTool(['shell', 'fs']);
    // A calls list is the fourth (QA71-E34, ADR 0108, 19); none is required, since a list stands for the three.
    expect(Object.keys(tool.parameters.properties)).toEqual(['connector', 'command', 'payload', 'calls']);
    expect('required' in tool.parameters).toBe(false);
    expect(tool.description).toContain('{ "connector": "fs", "command": "list", "payload": { "path": "src" } }');
    expect(tool.description).not.toContain('description"');
    const { prompt } = buildPrompt({ role: 'lead', workspacePath: '/w', language: 'en', platform: 'linux', shell: 'bash', sections: [], connectors: [] });
    expect(prompt).toContain('Your one tool is run: it runs one command of a connector, as { connector, command, payload }. Below, `fs write` means the connector fs and its command write.');
    expect(prompt).not.toContain('description is one sentence for the person');
    expect(parseRunArgs({ connector: 'fs', command: 'list' })).toEqual({ success: true, data: { connector: 'fs', command: 'list', payload: {} } });
  });

  it('QA57-E1 a call that still sends a description fails and names it', () => {
    const parsed = parseRunArgs({ description: 'Listing files.', connector: 'fs', command: 'list', payload: {} });
    expect(parsed.success).toBe(false);
    expect(parsed.success ? '' : parsed.problems).toContain('description');
  });
});

describe('calls repaired, not refused (08 §8.2, ADR 0102, 5)', () => {
  const lines = new Set(['shell', 'gh']);

  it('QA67-H11 a payload key beside the payload moves into it', () => {
    expect(parseRunArgs({ connector: 'shell', command: 'exec', payload: { line: 'ls' }, risky: false }, lines)).toEqual({ success: true, data: { connector: 'shell', command: 'exec', payload: { line: 'ls', risky: false } } });
    expect(repairedArguments({ connector: 'shell', command: 'exec', payload: { line: 'ls' }, risky: false }, lines)).toEqual({ connector: 'shell', command: 'exec', payload: { line: 'ls', risky: false } });
  });

  it('QA67-E10 a key the payload already has stays out, and the call fails', () => {
    const parsed = parseRunArgs({ connector: 'shell', command: 'exec', payload: { line: 'ls', risky: true }, risky: false }, lines);
    expect(parsed.success).toBe(false);
    expect(parsed.success ? '' : parsed.problems).toContain('risky');
    expect(repairedArguments({ connector: 'shell', command: 'exec', payload: { line: 'ls', risky: true }, risky: false }, lines)).toEqual({ connector: 'shell', command: 'exec', payload: { line: 'ls', risky: true }, risky: false });
  });

  it('QA67-E11 a shell line sent as the command is exec with that line, unless the payload has a line', () => {
    expect(parseRunArgs({ connector: 'shell', command: 'git status --short', payload: { risky: false } }, lines)).toEqual({ success: true, data: { connector: 'shell', command: 'exec', payload: { risky: false, line: 'git status --short' } } });
    expect(parseRunArgs({ connector: 'shell', command: 'git status', payload: { line: 'ls', risky: false } }, lines)).toEqual({ success: true, data: { connector: 'shell', command: 'git status', payload: { line: 'ls', risky: false } } });
    expect(parseRunArgs({ connector: 'shell', command: 'help' }, lines)).toEqual({ success: true, data: { connector: 'shell', command: 'help', payload: {} } });
  });

  it("QA67-E12 a program's arguments sent as the command are exec's args", () => {
    expect(parseRunArgs({ connector: 'gh', command: 'pr list', payload: { risky: false } }, lines)).toEqual({ success: true, data: { connector: 'gh', command: 'exec', payload: { risky: false, args: 'pr list' } } });
    expect(parseRunArgs({ connector: 'fs', command: 'read me' }, lines)).toEqual({ success: true, data: { connector: 'fs', command: 'read me', payload: {} } });
  });

  it('QA67-E13 a functions. prefix is dropped from the connector', () => {
    expect(parseRunArgs({ connector: 'functions.fs', command: 'list' }, lines)).toEqual({ success: true, data: { connector: 'fs', command: 'list', payload: {} } });
  });
});

describe('a run with a calls list (08 §8.2, ADR 0108, 19)', () => {
  const lines = new Set(['shell']);
  const block = (args: Record<string, unknown>) => ({ type: 'toolCall' as const, id: 'call_1', name: 'run', arguments: args as never });

  it('QA71-H32 a list becomes one run call per entry, repaired, with ids in order', () => {
    const expanded = expandedCalls(block({ calls: [{ connector: 'fs', command: 'read', payload: { path: 'a' } }, { connector: 'shell', command: 'ls -la', payload: { risky: false } }] }), lines);
    expect(expanded).toEqual([
      { type: 'toolCall', id: 'call_1-1', name: 'run', arguments: { connector: 'fs', command: 'read', payload: { path: 'a' } } },
      { type: 'toolCall', id: 'call_1-2', name: 'run', arguments: { connector: 'shell', command: 'exec', payload: { risky: false, line: 'ls -la' } } },
    ]);
  });

  it('QA71-E31 a list with a bad entry stays one call and fails naming the entry', () => {
    const args = { calls: [{ connector: 'fs', command: 'read', payload: { path: 'a' } }, { connector: 'fs' }] };
    expect(expandedCalls(block(args), lines)).toHaveLength(1);
    const parsed = parseRunArgs(args as never);
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.problems).toMatch(/^calls\[2\]: command: .*; none of the calls ran$/);
  });

  it('QA71-E32 an empty list and a list of 21 fail', () => {
    const entry = { connector: 'fs', command: 'list' };
    for (const calls of [[], Array.from({ length: 21 }, () => entry)]) {
      expect(expandedCalls(block({ calls }), lines)).toHaveLength(1);
      expect(parseRunArgs({ calls } as never)).toEqual({ success: false, problems: 'calls: a list of 1 to 20 calls, each { connector, command, payload? }' });
    }
  });

  it('QA71-E34 both shapes at once fail', () => {
    const args = { connector: 'fs', command: 'list', calls: [{ connector: 'fs', command: 'list' }] };
    expect(expandedCalls(block(args), lines)).toHaveLength(1);
    expect(parseRunArgs(args as never)).toEqual({ success: false, problems: 'calls: send either connector, command, and payload, or calls, not both' });
  });
});

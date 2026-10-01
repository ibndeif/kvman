import { describe, expect, it } from 'vitest';
import { callInput, parseLine } from '../../src/connector-line.ts';

const words = new Set(['todo', 'ask', 'subagent', 'jobs']);

describe('connector lines (08 §8.3, ADR 0009, 100)', () => {
  it('M2.4-E31 quoted JSON, heredocs, a here-string, no JSON, and --async anywhere all parse as calls', () => {
    expect(parseLine(`todo add '{"text":"it'\\''s"}'`, words)).toEqual({ kind: 'call', connector: 'todo', words: ['add', '{"text":"it\'s"}'], stdin: null, async: false });
    for (const quote of ["'EOF'", 'EOF', '"EOF"']) {
      expect(parseLine(`todo add <<${quote}\n{"text": "$HOME \`x\`"}\nEOF`, words)).toEqual({ kind: 'call', connector: 'todo', words: ['add'], stdin: '{"text": "$HOME `x`"}', async: false });
    }
    expect(parseLine(`@'\n{"text":"a"}\n'@ | todo add`, words)).toEqual({ kind: 'call', connector: 'todo', words: ['add'], stdin: '{"text":"a"}', async: false });
    expect(parseLine('todo list', words)).toMatchObject({ kind: 'call', words: ['list'], stdin: null });
    expect(parseLine(`todo --async add '{}'`, words)).toMatchObject({ kind: 'call', words: ['add', '{}'], async: true });
    expect(parseLine(`todo add '{}' --async`, words)).toMatchObject({ kind: 'call', words: ['add', '{}'], async: true });
    expect(parseLine('todo add "{\\"text\\":\\"b\\"}"', words)).toMatchObject({ kind: 'call', words: ['add', '{"text":"b"}'] });
    expect(callInput(['add'], null, 'todo')).toEqual({ command: 'add', input: {} });
    expect(callInput(['add', '{"text":"a"}'], null, 'todo')).toEqual({ command: 'add', input: { text: 'a' } });
    expect(callInput(['add'], '{"text":"a"}', 'todo')).toEqual({ command: 'add', input: { text: 'a' } });
  });

  it('M2.4-E32 a connector word inside shell syntax is refused, and anywhere else the line is plain shell', () => {
    const refused = [
      'todo list | head',
      'cd src && todo list',
      'false || todo list',
      'echo a; todo list',
      'todo list &',
      'todo list > out.json',
      'todo add < in.json',
      'echo $(todo list)',
      'echo `todo list`',
      'echo a\ntodo list',
      'todo add "$HOME"',
      `cat <<'EOF' | todo add\n{}\nEOF`,
    ];
    for (const line of refused) expect(parseLine(line, words), line).toEqual({ kind: 'refused', connector: 'todo' });
    for (const line of ['echo todo', 'ls -la | grep todo', 'git status', 'echo "todo list" > notes.txt']) expect(parseLine(line, words), line).toEqual({ kind: 'shell' });
  });

  it('M2.4-E33 bad JSON, a non-object, two inputs, or no command print VALIDATION_FAILED', () => {
    expect(callInput(['add', '{nope'], null, 'todo')).toMatchObject({ exitCode: 1, output: expect.stringMatching(/^error VALIDATION_FAILED: The input isn't JSON/) as unknown });
    expect(callInput(['add', '[1]'], null, 'todo')).toEqual({ exitCode: 1, output: 'error VALIDATION_FAILED: The input must be a JSON object.' });
    expect(callInput(['add', '{}'], '{}', 'todo')).toMatchObject({ exitCode: 1, output: expect.stringContaining('once') as unknown });
    expect(callInput([], null, 'todo')).toMatchObject({ exitCode: 1, output: expect.stringContaining('todo -h') as unknown });
  });
});

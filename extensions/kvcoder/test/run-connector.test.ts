import { describe, expect, it } from 'vitest';
import { runConnector } from '../src/connector-line.ts';
import { useKvcoder } from './support/kvcoder-kernel.ts';

const kvcoder = useKvcoder();

describe('runConnector (08 §8.4, ADR 0009, 96)', { timeout: 30_000 }, () => {
  it('M2.4-E34 -h lists a connector\'s commands, and a command\'s -h gives its schemas and examples; the built-ins have -h too', async () => {
    const { kernel } = await kvcoder.start();
    const list = await runConnector(kernel, 'todo -h');
    expect(list).toEqual({ exitCode: 0, output: expect.stringContaining('todo: Keep a todo list.\n\nCommands:\n  add   Adds a todo item.\n  wait  Waits at a gate, then adds an item.\n  fail  Always fails.') as unknown });
    const add = await runConnector(kernel, 'todo add -h');
    expect(add.exitCode).toBe(0);
    expect(add.output).toContain('todo add: Adds a todo item.\n\nInput (JSON Schema):\n{');
    expect(add.output).toContain('"text": {\n      "type": "string"');
    expect(add.output).toContain("Examples:\n  # Add an item\n  todo add '{\"text\":\"it'\\''s done\"}'");
    for (const builtin of ['ask', 'subagent', 'jobs']) expect((await runConnector(kernel, `${builtin} -h`)).output).toMatch(new RegExp(`^${builtin}: `));
  });

  it('M2.4-E33 a call prints its output as JSON, or an error line with exit 1', async () => {
    const { kernel } = await kvcoder.start();
    expect(await runConnector(kernel, `todo add '{"text":"a"}'`)).toEqual({ exitCode: 0, output: expect.stringMatching(/^\{\n {2}"id": ".+",\n {2}"text": "a"\n\}$/) as unknown });
    expect(await runConnector(kernel, `todo add <<'EOF'\n{"text":"b"}\nEOF`)).toMatchObject({ exitCode: 0 });
    expect(await runConnector(kernel, `@'\n{"text":"c"}\n'@ | todo add`)).toMatchObject({ exitCode: 0 });
    expect(await kernel.exec('todo.item.list', {})).toEqual([{ text: 'a' }, { text: 'b' }, { text: 'c' }]);
    expect(await runConnector(kernel, 'todo nope')).toEqual({ exitCode: 1, output: 'error NOT_FOUND: todo has no command nope; run `todo -h`.' });
    expect(await runConnector(kernel, `todo add '{nope'`)).toMatchObject({ exitCode: 1, output: expect.stringMatching(/^error VALIDATION_FAILED: /) as unknown });
    expect(await runConnector(kernel, `todo add '{"text":1}'`)).toMatchObject({ exitCode: 1, output: expect.stringMatching(/^error VALIDATION_FAILED: /) as unknown });
    expect(await runConnector(kernel, 'todo fail')).toEqual({ exitCode: 1, output: expect.stringMatching(/^error todo\/BROKEN: /) as unknown });
  });

  it('M2.4-E32 M2.4-E35 non-standalone lines, built-in calls, and plain shell lines return exit 1 without running', async () => {
    const { kernel } = await kvcoder.start();
    expect(await runConnector(kernel, `todo add '{"text":"a"}' | cat`)).toEqual({ exitCode: 1, output: expect.stringContaining('connector calls stand alone') as unknown });
    expect(await runConnector(kernel, `ask text '{"prompt":"?"}'`)).toEqual({ exitCode: 1, output: 'ask runs only inside a turn' });
    expect(await runConnector(kernel, 'jobs list')).toEqual({ exitCode: 1, output: 'jobs runs only inside a turn' });
    expect(await runConnector(kernel, 'echo todo')).toEqual({ exitCode: 1, output: 'not a connector call' });
    expect(await kernel.exec('todo.item.list', {})).toEqual([]);
  });
});

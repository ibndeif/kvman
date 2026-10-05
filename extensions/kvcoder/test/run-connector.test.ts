import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runConnector } from '../src/connector-call.ts';
import { useKvcoder } from './support/kvcoder-kernel.ts';

const kvcoder = useKvcoder();

describe('runConnector (08 §8.4, ADR 0009, 96; ADR 0011, 18)', { timeout: 30_000 }, () => {
  it("M2.4-E34 help lists a connector's commands, and a command's help gives its schemas and examples; the built-ins have help too", async () => {
    const { kernel } = await kvcoder.start();
    const list = await runConnector(kernel, { connector: 'todo', command: 'help' });
    expect(list).toEqual({ exitCode: 0, output: expect.stringContaining('todo: Keep a todo list.\n\nCommands:\n  add   Adds a todo item.\n  wait  Waits at a gate, then adds an item.\n  fail  Always fails.\n  list  Lists the items.\n  help  ') as unknown });
    const add = await runConnector(kernel, { connector: 'todo', command: 'help', payload: { command: 'add' } });
    expect(add.exitCode).toBe(0);
    expect(add.output).toContain('todo add: Adds a todo item.\n\nPayload (JSON Schema):\n{');
    expect(add.output).toContain('"text": {\n      "type": "string"');
    expect(add.output).toContain('Result (JSON Schema):\n{');
    expect(add.output).toContain('Examples:\n  # Add an item\n  { "connector": "todo", "command": "add", "payload": {"text":"it\'s done"} }');
    for (const builtin of ['shell', 'fs', 'artifact', 'background', 'ask', 'subagent']) expect((await runConnector(kernel, { connector: builtin, command: 'help' })).output).toMatch(new RegExp(`^${builtin}: `));
  });

  it('M2.4-E33 a call returns its output as JSON, or an error line with exit 1', async () => {
    const { kernel } = await kvcoder.start();
    expect(await runConnector(kernel, { connector: 'todo', command: 'add', payload: { text: 'a' } })).toEqual({ exitCode: 0, output: expect.stringMatching(/^\{\n {2}"id": ".+",\n {2}"text": "a"\n\}$/) as unknown });
    expect(await kernel.exec('todo.item.list', {})).toEqual([{ text: 'a' }]);
    expect(await runConnector(kernel, { connector: 'todo', command: 'nope' })).toEqual({ exitCode: 1, output: 'error NOT_FOUND: todo has no command nope; call its help.' });
    expect(await runConnector(kernel, { connector: 'nope', command: 'add' })).toEqual({ exitCode: 1, output: expect.stringMatching(/^error VALIDATION_FAILED: There is no connector nope\. The connectors are: shell, .*todo\.$/) as unknown });
    expect(await runConnector(kernel, { connector: 'todo', command: 'add', payload: { text: 1 } })).toMatchObject({ exitCode: 1, output: expect.stringMatching(/^error VALIDATION_FAILED: text: .*The payload of todo add is\n\{ text \}$/s) as unknown });
    expect(await runConnector(kernel, { connector: 'todo', command: 'fail' })).toEqual({ exitCode: 1, output: expect.stringMatching(/^error todo\/BROKEN: /) as unknown });
  });

  it('M2.4-E35 built-in calls and binary connectors return exit 1 without running', async () => {
    const { kernel } = await kvcoder.start({ settings: { 'kvcoder.connectors': [{ name: 'node', description: 'Node.js.', binary: { check: 'node --version' } }] } });
    expect(await runConnector(kernel, { connector: 'ask', command: 'text', payload: { prompt: '?' } })).toEqual({ exitCode: 1, output: 'ask runs only inside a turn' });
    expect(await runConnector(kernel, { connector: 'background', command: 'list' })).toEqual({ exitCode: 1, output: 'background runs only inside a turn' });
    expect(await runConnector(kernel, { connector: 'shell', command: 'exec', payload: { line: 'touch ran.txt' } })).toEqual({ exitCode: 1, output: 'shell runs only inside a turn' });
    expect(await runConnector(kernel, { connector: 'node', command: 'exec', payload: { args: '-e 1' } })).toEqual({ exitCode: 1, output: 'node runs only inside a turn' });
    expect(existsSync(path.join(kernel.homeFolder, 'ran.txt'))).toBe(false);
  });

  it('QA18-H18 runConnector runs a commands connector and every help, and never a built-in command', async () => {
    const { kernel } = await kvcoder.start();
    expect(await runConnector(kernel, { connector: 'todo', command: 'add', payload: { text: 'milk' } })).toMatchObject({ exitCode: 0, output: expect.stringContaining('"text": "milk"') as unknown });
    expect((await runConnector(kernel, { connector: 'todo', command: 'help' })).exitCode).toBe(0);
    expect(await runConnector(kernel, { connector: 'fs', command: 'help' })).toMatchObject({ exitCode: 0, output: expect.stringMatching(/^fs: /) as unknown });
    expect(await runConnector(kernel, { connector: 'fs', command: 'write', payload: { path: 'a.txt', content: 'x' } })).toEqual({ exitCode: 1, output: 'fs runs only inside a turn' });
    expect(existsSync(path.join(kernel.homeFolder, 'a.txt'))).toBe(false);
  });

  it('QA6-H6 artifact help is answered, and a real call runs only inside a turn', async () => {
    const { kernel } = await kvcoder.start();
    const help = await runConnector(kernel, { connector: 'artifact', command: 'help' });
    expect(help.exitCode).toBe(0);
    expect(help.output).toMatch(/^artifact: Show the person something to read or see/);
    expect(await runConnector(kernel, { connector: 'artifact', command: 'get', payload: { id: 'plan' } })).toEqual({ exitCode: 1, output: 'artifact runs only inside a turn' });
  });
});

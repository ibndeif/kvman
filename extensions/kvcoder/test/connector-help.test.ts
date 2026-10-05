import { describe, expect, it } from 'vitest';
import { useLooked } from './support/looked.ts';
import { command } from './support/model-script.ts';

const looked = useLooked();
const nothing = (): void => undefined;

describe("a connector's help (08 §8.3, ADR 0011, 4)", { timeout: 30_000 }, () => {
  it("QA18-H4 help describes a connector and its commands, and one command's payload, result, and examples", async () => {
    const { results } = await looked(nothing, [command('todo', 'help'), command('todo', 'help', { command: 'add' })]);
    expect(results[0]).toBe(
      ['todo: Keep a todo list.', '', 'Commands:', '  add   Adds a todo item.', '  wait  Waits at a gate, then adds an item.', '  fail  Always fails.', '  list  Lists the items.', '  help  Describes this connector, or one command with { "command": "<name>" }.', '', 'Call help with { "command": "<name>" } for a command\'s payload, result, and examples.'].join('\n'),
    );
    expect(results[1]).toMatch(/^todo add: Adds a todo item\.\n\nPayload \(JSON Schema\):\n\{[\s\S]*"text"[\s\S]*\n\nResult \(JSON Schema\):\n\{[\s\S]*"id"[\s\S]*\n\nExamples:\n {2}# Add an item\n {2}\{ "connector": "todo", "command": "add", "payload": \{"text":"it's done"\} \}$/);
  });

  it('QA18-H5 every built-in connector has help, and a command\'s help holds its payload with a description on every field', async () => {
    const builtins = { shell: ['exec'], fs: ['read', 'list', 'search', 'write', 'edit'], artifact: ['write', 'edit', 'get'], background: ['list', 'output', 'stop'], ask: ['text', 'choice', 'confirm'], subagent: ['run'] };
    const { results } = await looked(nothing, [...Object.keys(builtins).map((name) => command(name, 'help')), command('fs', 'help', { command: 'edit' }), command('shell', 'help', { command: 'exec' }), command('ask', 'help', { command: 'confirm' })]);
    for (const [index, [name, commands]] of Object.entries(builtins).entries()) {
      expect(results[index], name).toMatch(new RegExp(`^${name}: `));
      for (const listed of [...commands, 'help']) expect(results[index], `${name} ${listed}`).toMatch(new RegExp(`\\n {2}${listed} +\\S`));
    }
    const edit = results[6] ?? '';
    const schema = JSON.parse(edit.slice(edit.indexOf('{'), edit.indexOf('\n\nResult'))) as { properties: Record<string, { description?: string }>; required: string[] };
    expect(Object.keys(schema.properties)).toEqual(['path', 'edits', 'risky']);
    for (const field of Object.values(schema.properties)) expect(field.description).toEqual(expect.any(String));
    expect(schema.required).toEqual(['path', 'edits']);
    expect(edit).toContain('Result (JSON Schema):\n{');
    expect(results[7]).toContain('Result: the combined output, then [exit code N].');
    expect(results[8]).toContain('Result: the person\'s answer: { "confirmed" }, or { "dismissed": true }.');
  });

  it('QA18-E8 help of a command the connector does not have fails NOT_FOUND, and help takes nothing else', async () => {
    const { results } = await looked(nothing, [command('todo', 'help', { command: 'nope' }), command('fs', 'help', { command: 'nope' }), command('todo', 'help', { topic: 'add' })]);
    expect(results[0]).toBe('error NOT_FOUND: todo has no command nope; call its help.');
    expect(results[1]).toBe('error NOT_FOUND: fs has no command nope; call its help.');
    expect(results[2]).toBe('error VALIDATION_FAILED: help takes { "command"? }.');
  });
});

import { describe, expect, it } from 'vitest';
import { useLooked } from './support/looked.ts';
import { command, systemPrompt } from './support/model-script.ts';

const looked = useLooked();

describe("the prompt's connector index (08 §8.2, ADR 0011, 3)", { timeout: 30_000 }, () => {
  it('QA18-H8 each connector is its name, its description, and its commands, with no payload shape, and the prompt names the run tool', async () => {
    const settings = { 'kvcoder.connectors': [{ name: 'node', description: 'Node.js.', binary: { check: 'node --version' } }] } as unknown as Record<string, string>;
    const { fake } = await looked(() => undefined, [command('todo', 'list')], settings);
    const prompt = systemPrompt(fake);
    const index = (prompt.split('## Connectors\n')[1] ?? '').split('\n');
    expect(index.map((line) => /^- ([\w-]+): /.exec(line)?.[1])).toEqual(['shell', 'fs', 'artifact', 'background', 'ask', 'subagent', 'todo', 'node']);
    expect(index.map((line) => /Commands: (.+)\.$/.exec(line)?.[1])).toEqual(['exec, help', 'read, list, search, write, edit, help', 'write, edit, get, help', 'list, output, stop, help', 'text, choice, confirm, help', 'run, help', 'add, wait, fail, list, help', 'exec, help']);
    expect(index.at(-2)).toBe('- todo: Keep a todo list. Commands: add, wait, fail, list, help.');
    expect(index.at(-1)).toBe('- node: Node.js. Commands: exec, help.');
    expect(index.join('\n')).not.toMatch(/\{ ?"|oldText|fromLine/);
    expect(prompt).toContain('Your one tool is run: it runs one command of a connector, as { description, connector, command, payload }.');
  });
});

import { describe, expect, it } from 'vitest';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { useLooked } from './support/looked.ts';
import { command, runs, says, systemPrompt } from './support/model-script.ts';
import { newSession } from './support/turns.ts';

const kvcoder = useKvcoder();
const looked = useLooked();

const settings = { 'kvcoder.connectors': [{ name: 'node', description: 'Node.js.', binary: { check: 'node --version' } }] } as unknown as Record<string, string>;

describe("the prompt's connector index (08 §8.2, ADR 0011, 3)", { timeout: 30_000 }, () => {
  it('QA18-H8 each connector is its name, its description, and its commands, and the prompt names the run tool', async () => {
    const { fake } = await looked(() => undefined, [command('todo', 'list')], settings);
    const prompt = systemPrompt(fake);
    const index = (prompt.split('## Connectors\n')[1] ?? '').split('\n');
    const headers = index.filter((line) => line.startsWith('- '));
    expect(headers.map((line) => /^- ([\w-]+): /.exec(line)?.[1])).toEqual(['shell', 'fs', 'artifact', 'background', 'ask', 'subagent', 'todo', 'node']);
    expect(headers.at(-2)).toBe('- todo: Keep a todo list. Commands: add, wait, fail, list, help.');
    expect(headers.at(-1)).toBe('- node: Node.js. Commands: exec, help.');
    expect(prompt).toContain('Your one tool is run: it runs one command of a connector, as { description, connector, command, payload }.');
  });

  it("QA19-H1 the prompt gives the payloads of kvcoder's six connectors", async () => {
    const { fake } = await looked(() => undefined, [command('todo', 'list')], settings);
    const prompt = systemPrompt(fake);
    const index = (prompt.split('## Connectors\n')[1] ?? '').split('\n');
    const headers = index.filter((line) => line.startsWith('- '));
    expect(headers.map((line) => /^- ([\w-]+): /.exec(line)?.[1])).toEqual(['shell', 'fs', 'artifact', 'background', 'ask', 'subagent', 'todo', 'node']);
    expect(headers.slice(0, 6).every((line) => /^- [\w-]+: \S.*[.!?]$/.test(line) && !line.includes('Commands:'))).toBe(true);
    expect(headers.at(-2)).toBe('- todo: Keep a todo list. Commands: add, wait, fail, list, help.');
    expect(headers.at(-1)).toBe('- node: Node.js. Commands: exec, help.');
    const lines = index.filter((line) => line.startsWith('  '));
    expect(lines).toEqual([
      '  exec { line, background?, timeoutMs?, risky }',
      '  help { command? }',
      '  read   { path, fromLine?, lines? }',
      '  list   { path? }',
      '  search { pattern, path? }',
      '  write  { path, content, risky }',
      '  edit   { path, edits: [{ oldText, newText }], risky }',
      '  help   { command? }',
      '  write { id, title, format?: "markdown" | "html" | "url", content }',
      '  edit  { id, edits: [{ oldText, newText }] }',
      '  get   { id }',
      '  help  { command? }',
      '  list   {}',
      '  output { id }',
      '  stop   { id }',
      '  help   { command? }',
      '  text    { prompt, placeholder? }',
      '  choice  { prompt, multiple, options: [{ id, label, description? }], other? }',
      '  confirm { prompt, danger? }',
      '  help    { command? }',
      '  run  { task, mode: "fresh" | "fork", connectors?, background? }',
      '  help { command? }',
    ]);
  });

  it("QA19-H6 the artifact connector's description", async () => {
    const { fake } = await looked(() => undefined, [command('todo', 'list')]);
    const prompt = systemPrompt(fake);
    expect(prompt).toContain('when you write a plan, keep it in the artifact `plan`');
    expect(prompt).not.toContain('keep your plan in the artifact `plan`');
  });

  it("QA19-E12 a subagent's index", async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    fake.reply(runs(command('subagent', 'run', { task: 'List files.', mode: 'fresh', connectors: ['fs'] })), runs(command('fs', 'list')), says('child done'), says('parent done'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    const prompt = systemPrompt(fake, 1);
    const index = (prompt.split('## Connectors\n')[1] ?? '').split('\n');
    expect(index.filter((line) => line.startsWith('- ')).map((line) => /^- ([\w-]+): /.exec(line)?.[1])).toEqual(['fs', 'ask']);
    expect(index.filter((line) => line.startsWith('  '))).toEqual([
      '  read   { path, fromLine?, lines? }',
      '  list   { path? }',
      '  search { pattern, path? }',
      '  write  { path, content, risky }',
      '  edit   { path, edits: [{ oldText, newText }], risky }',
      '  help   { command? }',
      '  text    { prompt, placeholder? }',
      '  choice  { prompt, multiple, options: [{ id, label, description? }], other? }',
      '  confirm { prompt, danger? }',
      '  help    { command? }',
    ]);
    for (const absent of ['- shell: ', '- artifact: ', '- background: ', '- subagent: ', '- todo: ', '- node: ']) expect(prompt).not.toContain(absent);
  });
});

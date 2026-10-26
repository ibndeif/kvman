import { describe, expect, it } from 'vitest';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { useLooked } from './support/looked.ts';
import { command, runs, says, systemPrompt } from './support/model-script.ts';
import { newSession } from './support/turns.ts';
import { worker, workers } from './support/workers.ts';

const kvcoder = useKvcoder();
const looked = useLooked();

const settings = { 'kvcoder.connectors': [{ name: 'node', description: 'Node.js.', binary: { check: 'node --version' } }] } as unknown as Record<string, string>;

describe("the prompt's connector index (08 §8.2, ADR 0011, 3)", { timeout: 30_000 }, () => {
  it('QA18-H8 each connector is its name, its description, and its commands, and the prompt names the run tool', async () => {
    const { fake } = await looked(() => undefined, [command('todo', 'list')], settings);
    const prompt = systemPrompt(fake);
    const index = (prompt.split('## Connectors\n')[1] ?? '').split('\n');
    const headers = index.filter((line) => line.startsWith('- '));
    expect(headers.map((line) => /^- ([\w-]+): /.exec(line)?.[1])).toEqual(['shell', 'fs', 'artifact', 'execution-map', 'background', 'ask', 'delegate', 'web', 'todo', 'node']);
    expect(headers.at(-2)).toBe('- todo: Keep a todo list. Commands: add, wait, fail, list, help.');
    expect(headers.at(-1)).toBe('- node: Node.js. Commands: exec, help.');
    expect(prompt).toContain('Your one tool is run: it runs one command of a connector, as { connector, command, payload }.');
  });

  it("QA19-H1 the prompt gives the payloads of kvcoder's connectors", async () => {
    const { fake } = await looked(() => undefined, [command('todo', 'list')], settings);
    const prompt = systemPrompt(fake);
    const index = (prompt.split('## Connectors\n')[1] ?? '').split('\n');
    const headers = index.filter((line) => line.startsWith('- '));
    expect(headers.map((line) => /^- ([\w-]+): /.exec(line)?.[1])).toEqual(['shell', 'fs', 'artifact', 'execution-map', 'background', 'ask', 'delegate', 'web', 'todo', 'node']);
    expect(headers.slice(0, 8).every((line) => /^- [\w-]+: \S.*[.!?]$/.test(line) && !line.includes('Commands:'))).toBe(true);
    expect(headers.at(-2)).toBe('- todo: Keep a todo list. Commands: add, wait, fail, list, help.');
    expect(headers.at(-1)).toBe('- node: Node.js. Commands: exec, help.');
    const lines = index.filter((line) => line.startsWith('  '));
    expect(lines).toEqual([
      '  exec { line, background?, timeoutMs?, risky }',
      '  help { command? }',
      '  read       { path, fromLine?, fromColumn?, lines? }',
      '  read-files { files: [{ path, fromLine?, lines? }] }',
      '  list       { path? }',
      '  find       { pattern, path? }',
      '  search     { pattern, path?, literal?, glob?, context?, filesOnly? }',
      '  write      { path, content, risky }',
      '  edit       { path, edits: [{ oldText, newText, replaceAll? }], risky }',
      '  undo       { path, risky }',
      '  part       { path, part, content }',
      '  assemble   { path, risky }',
      '  help       { command? }',
      '  write  { id (≤50), title (≤100), format?: "markdown" | "html" | "url", content }',
      '  edit   { id (≤50), edits: [{ oldText, newText, replaceAll? }] }',
      '  get    { id (≤50) }',
      '  delete { id (≤50) }',
      '  help   { command? }',
      '  set    { goal (≤300), steps: [{ id (≤50), title (≤100), after?, uses?, check (≤300), details? (≤4000) }] }',
      '  detail { id (≤50), details (≤4000) }',
      '  update { steps: [{ id (≤50), status: "todo" | "doing" | "done" | "failed" | "skipped", evidence? (≤500), note? (≤300) }] }',
      '  note   { text (≤500) }',
      '  get    { id? (≤50) }',
      '  help   { command? }',
      '  list   {}',
      '  output { id, lines? }',
      '  wait   { id, timeoutMs? }',
      '  stop   { id }',
      '  help   { command? }',
      '  text    { prompt, placeholder? }',
      '  choice  { prompt, multiple, options: [{ id, label, description? }], other? }',
      '  confirm { prompt, danger? }',
      '  help    { command? }',
      '  run      { worker, title (≤200), task, background? }',
      '  continue { id, message, background? }',
      '  help     { command? }',
      '  fetch { url }',
      '  help  { command? }',
    ]);
  });

  it('QA52-H8 the execution map states its limits in the index', async () => {
    const { fake } = await looked(() => undefined, [command('todo', 'list')], settings);
    const entry = (systemPrompt(fake).split('## Connectors\n')[1] ?? '').split('\n').find((line) => line.startsWith('- execution-map: '));
    // Superseded by QA65-H13: every limit as the schemas have it (ADR 0097, 8).
    expect(entry?.endsWith("Limits: goal up to 300 characters; 1 to 40 steps; a step's id lowercase kebab case up to 50, title up to 100, uses one name up to 60 or a list of up to 5, check up to 300, and details up to 4,000; a step's evidence 10 to 500 and its note up to 300; a note of note up to 500.")).toBe(true);
  });

  it("QA19-H6 the artifact connector's description", async () => {
    const { fake } = await looked(() => undefined, [command('todo', 'list')]);
    const prompt = systemPrompt(fake);
    expect(prompt).not.toContain('when you write a plan');
    expect(prompt).not.toContain('keep your plan in the artifact `plan`');
  });

  it("QA19-E12 a subagent's index", async () => {
    const { kernel, fake } = await kvcoder.start({ settings: workers(worker('files', { connectors: ['fs'] })) });
    const sessionId = await newSession(kernel);
    fake.reply(runs(command('delegate', 'run', { worker: 'files', title: 'Helper', task: 'List files.' })), runs(command('fs', 'list')), says('child done'), says('parent done'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    const prompt = systemPrompt(fake, 1);
    const index = (prompt.split('## Connectors\n')[1] ?? '').split('\n');
    expect(index.filter((line) => line.startsWith('- ')).map((line) => /^- ([\w-]+): /.exec(line)?.[1])).toEqual(['fs']);
    expect(index.filter((line) => line.startsWith('  '))).toEqual([
      '  read       { path, fromLine?, fromColumn?, lines? }',
      '  read-files { files: [{ path, fromLine?, lines? }] }',
      '  list       { path? }',
      '  find       { pattern, path? }',
      '  search     { pattern, path?, literal?, glob?, context?, filesOnly? }',
      '  write      { path, content, risky }',
      '  edit       { path, edits: [{ oldText, newText, replaceAll? }], risky }',
      '  undo       { path, risky }',
      '  part       { path, part, content }',
      '  assemble   { path, risky }',
      '  help       { command? }',
    ]);
    for (const absent of ['- ask: ', '- shell: ', '- artifact: ', '- background: ', '- delegate: ', '- todo: ', '- node: ']) expect(prompt).not.toContain(absent);
  });
});

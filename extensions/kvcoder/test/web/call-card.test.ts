import { describe, expect, it } from 'vitest';
import MessageItem from '../../web/src/MessageItem.vue';
import { callViews } from '../../web/src/message-parts.ts';
import { createFakeKvman } from './support/fake-kvman.ts';
import { message, mounted } from './support/fixtures.ts';

type Wrapper = Awaited<ReturnType<typeof mounted>>;
type Json = Parameters<typeof message>[1][string];

const toolCall = (name: string, args: Record<string, Json>) => message('assistant', { role: 'assistant', content: [{ type: 'toolCall', id: 'c1', name, arguments: args }] });
const toolResult = (name: string, text: string, extra: Record<string, Json> = {}) => message('toolResult', { role: 'toolResult', toolCallId: 'c1', toolName: name, content: [{ type: 'text', text }], isError: false, ...extra });

// A `run` call and its result, as kvcoder stores them: the result's details name the call, and the call holds the payload.
async function card(call: { description: string; connector: string; command: string; payload?: Record<string, Json> }, text: string, details: Record<string, Json> = {}, isError = false): Promise<Wrapper> {
  const assistant = toolCall('run', call);
  const result = toolResult('run', text, { isError, details: { description: call.description, connector: call.connector, command: call.command, output: text.replace(/\n?\[exit code \d+\]$/, ''), durationMs: 200, ...details } });
  return mounted(MessageItem, createFakeKvman(), { message: result, calls: callViews([assistant, result]) });
}

async function oldCard(args: Record<string, Json>, text: string): Promise<Wrapper> {
  const assistant = toolCall('bash', args);
  const result = toolResult('bash', text);
  return mounted(MessageItem, createFakeKvman(), { message: result, calls: callViews([assistant, result]) });
}

const opened = (wrapper: Wrapper) => wrapper.find('[data-test="call-card"] button').trigger('click');
const found = (wrapper: Wrapper, name: string) => wrapper.find(`[data-test="${name}"]`);

describe("a call's card says what the call does (08 §8.7, ADR 0011, 13)", () => {
  it('QA18-H19 closed, the card shows the description, then the connector and command and the time; opened, the payload and the output', async () => {
    const edit = await card({ description: 'Editing app.ts to add the save button', connector: 'fs', command: 'edit', payload: { path: 'src/app.ts', edits: [{ oldText: 'a', newText: 'b' }] } }, '{\n  "path": "src/app.ts",\n  "replacements": 1\n}');
    expect(found(edit, 'call-description').text()).toBe('Editing app.ts to add the save button');
    expect(found(edit, 'call-label').text()).toBe('fs · edit');
    expect(found(edit, 'call-card').text()).toContain('0.2 s');
    expect(found(edit, 'call-payload').exists()).toBe(false);
    await opened(edit);
    expect(JSON.parse(found(edit, 'call-payload').text())).toEqual({ path: 'src/app.ts', edits: [{ oldText: 'a', newText: 'b' }] });
    expect(found(edit, 'call-output').text()).toContain('"replacements": 1');
    const html = edit.html();
    expect(html.indexOf('data-test="call-payload"')).toBeLessThan(html.indexOf('data-test="call-output"'));
    edit.unmount();

    const shell = await card({ description: "Listing the folder's files", connector: 'shell', command: 'exec', payload: { line: 'ls -a | wc -l', risky: false } }, '14\n[exit code 0]', { exitCode: 0 });
    expect(found(shell, 'call-label').text()).toBe('shell · exec');
    await opened(shell);
    expect(found(shell, 'call-payload').text()).toBe('ls -a | wc -l');
    expect(found(shell, 'call-output').text()).toBe('14');
    shell.unmount();
  });

  it('QA18-E22 a call stored before the run tool shows its command line, and its output when opened', async () => {
    const bare = await oldCard({ command: 'ls -a' }, 'a\nb\n[exit code 0]');
    expect(found(bare, 'call-line').text()).toBe('ls -a');
    expect(found(bare, 'call-description').exists()).toBe(false);
    await opened(bare);
    expect(found(bare, 'call-payload').text()).toBe('ls -a');
    expect(found(bare, 'call-output').text()).toBe('a\nb');
    bare.unmount();

    const titled = await oldCard({ title: 'Run the tests', description: 'Checks the page.', command: 'npm test' }, 'ok\n[exit code 0]');
    expect(found(titled, 'call-description').text()).toBe('Run the tests');
    await opened(titled);
    expect(found(titled, 'call-payload').text()).toBe('npm test');
    titled.unmount();
  });

  it('QA9-H10 an empty output has no block', async () => {
    const wrapper = await card({ description: 'Making the folder.', connector: 'shell', command: 'exec', payload: { line: 'mkdir out' } }, '[exit code 0]', { exitCode: 0 });
    await opened(wrapper);
    expect(found(wrapper, 'call-payload').text()).toBe('mkdir out');
    expect(found(wrapper, 'call-output').exists()).toBe(false);
    wrapper.unmount();
  });

  it('QA10-H8 a card has no exit chip, whatever the exit code, and still shows the time', async () => {
    const wrapper = await card({ description: 'Running the tests.', connector: 'shell', command: 'exec', payload: { line: 'npm test' } }, 'FAIL 1\n[exit code 1]', { exitCode: 1 }, true);
    expect(found(wrapper, 'exit-code').exists()).toBe(false);
    expect(found(wrapper, 'call-card').text()).not.toContain('exit');
    expect(found(wrapper, 'call-card').text()).toContain('0.2 s');
    await opened(wrapper);
    expect(found(wrapper, 'call-output').text()).toBe('FAIL 1');
    wrapper.unmount();
  });

  it('QA10-H9 a failed call has a danger border: a shell line that exits 1, a connector command that returns an error, and an old result ending [exit code 1]', async () => {
    const exited = await card({ description: 'Running the tests.', connector: 'shell', command: 'exec', payload: { line: 'npm test' } }, 'FAIL 1\n[exit code 1]', { exitCode: 1 }, true);
    expect(found(exited, 'call-card').classes()).toContain('kvc-failed');
    exited.unmount();
    const errored = await card({ description: 'Editing a file.', connector: 'fs', command: 'edit', payload: { path: 'missing.txt' } }, "error NOT_FOUND: missing.txt doesn't exist.", {}, true);
    expect(found(errored, 'call-card').classes()).toContain('kvc-failed');
    errored.unmount();
    const old = await oldCard({ command: 'npm test' }, 'FAIL 1\n[exit code 1]');
    expect(found(old, 'call-card').classes()).toContain('kvc-failed');
    old.unmount();
    const ok = await card({ description: 'Running the tests.', connector: 'shell', command: 'exec', payload: { line: 'npm test' } }, 'ok\n[exit code 0]', { exitCode: 0 });
    expect(found(ok, 'call-card').classes()).not.toContain('kvc-failed');
    ok.unmount();
  });

  it('QA10-E7 a result with no exit code and no error has no failure border', async () => {
    const wrapper = await oldCard({ description: 'List the folder.', command: 'ls -la' }, 'total 0');
    expect(found(wrapper, 'call-card').classes()).not.toContain('kvc-failed');
    wrapper.unmount();
  });

  it('QA9-E15 an assistant message that only calls a tool renders nothing, and one with text or thinking renders as before', async () => {
    const calling = toolCall('run', { description: 'Listing.', connector: 'fs', command: 'list' });
    const silent = await mounted(MessageItem, createFakeKvman(), { message: calling, calls: new Map() });
    expect(found(silent, 'assistant-message').exists()).toBe(false);
    silent.unmount();

    const thinking = message('assistant', { role: 'assistant', content: [{ type: 'thinking', thinking: 'Plan it.' }, { type: 'toolCall', id: 'c2', name: 'run', arguments: { description: 'Listing.', connector: 'fs', command: 'list' } }] });
    const thoughtful = await mounted(MessageItem, createFakeKvman(), { message: thinking, calls: new Map() });
    expect(found(thoughtful, 'thinking').text()).toContain('Plan it.');
    thoughtful.unmount();

    const text = message('assistant', { role: 'assistant', content: [{ type: 'text', text: 'Done.' }] });
    const said = await mounted(MessageItem, createFakeKvman(), { message: text, calls: new Map() });
    expect(found(said, 'assistant-message').text()).toContain('Done.');
    said.unmount();
  });
});

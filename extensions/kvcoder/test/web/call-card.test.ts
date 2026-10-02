import { describe, expect, it } from 'vitest';
import MessageItem from '../../web/src/MessageItem.vue';
import { callInfos } from '../../web/src/message-parts.ts';
import { createFakeKvman } from './support/fake-kvman.ts';
import { message, mounted } from './support/fixtures.ts';

type Call = { description?: string; title?: string; command: string };

function connector(call: Call, text: string): { assistant: ReturnType<typeof message>; result: ReturnType<typeof message> } {
  const assistant = message('assistant', { role: 'assistant', content: [{ type: 'toolCall', id: 'c1', name: 'bash', arguments: { risky: false, ...call } }] });
  const result = message('toolResult', { role: 'toolResult', toolCallId: 'c1', toolName: 'bash', content: [{ type: 'text', text }], isError: false });
  return { assistant, result };
}

async function card(call: Call, text: string): Promise<Awaited<ReturnType<typeof mounted>>> {
  const { assistant, result } = connector(call, text);
  return mounted(MessageItem, createFakeKvman(), { message: result, calls: callInfos([assistant, result]) });
}

async function opened(wrapper: Awaited<ReturnType<typeof mounted>>): Promise<void> {
  await wrapper.find('[data-test="shell-result"] button').trigger('click');
}

describe("a call's card always says what the call is (ADR 0009, 186, 195)", () => {
  it('QA9-H7 a call without a title shows its description as the title, once', async () => {
    const wrapper = await card({ description: 'Create the todo app HTML file', command: 'cat > index.html' }, 'ok\n[exit code 0]');
    expect(wrapper.find('[data-test="call-title"]').text()).toBe('Create the todo app HTML file');
    expect(wrapper.find('[data-test="call-description"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="call-command"]').text()).toBe('cat > index.html');
    wrapper.unmount();
  });

  it('QA9-H8 a long description gives a cut title and is shown in full', async () => {
    const description = 'D'.repeat(80);
    const wrapper = await card({ description, command: 'cat > index.html' }, 'ok\n[exit code 0]');
    expect(wrapper.find('[data-test="call-title"]').text()).toBe(`${'D'.repeat(60)}…`);
    expect(wrapper.find('[data-test="call-description"]').text()).toBe(description);
    wrapper.unmount();
  });

  it("QA9-H9 a card's command is one short line, and opening it shows everything", async () => {
    const command = 'c'.repeat(19_000);
    const wrapper = await card({ description: 'Writes the file.', command }, 'done output\n[exit code 0]');
    const row = wrapper.find('[data-test="call-command"]').text();
    expect(row).toBe(`${'c'.repeat(200)}…`);
    await opened(wrapper);
    expect(wrapper.find('[data-test="shell-command"]').text()).toBe(command);
    expect(wrapper.find('[data-test="shell-output"]').text()).toBe('done output');
    const html = wrapper.html();
    expect(html.indexOf('data-test="shell-command"')).toBeLessThan(html.indexOf('data-test="shell-output"'));
    wrapper.unmount();
  });

  it('QA9-H10 an empty output has no block', async () => {
    const wrapper = await card({ description: 'Lists.', command: 'ls -la' }, '[exit code 0]');
    await opened(wrapper);
    expect(wrapper.find('[data-test="shell-command"]').text()).toBe('ls -la');
    expect(wrapper.find('[data-test="shell-output"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('QA9-E6 a blank title is missing, and a given title is kept with its description', async () => {
    const blank = await card({ title: '   ', description: 'Create the todo file', command: 'touch todo.txt' }, 'ok\n[exit code 0]');
    expect(blank.find('[data-test="call-title"]').text()).toBe('Create the todo file');
    expect(blank.find('[data-test="call-description"]').exists()).toBe(false);
    blank.unmount();

    const given = await card({ title: 'Run the tests', description: 'Checks the page.', command: 'npm test' }, 'ok\n[exit code 0]');
    expect(given.find('[data-test="call-title"]').text()).toBe('Run the tests');
    expect(given.find('[data-test="call-description"]').text()).toBe('Checks the page.');
    given.unmount();
  });

  it('QA9-E7 with neither title nor description the row shows the cut command alone', async () => {
    const wrapper = await card({ command: 'c'.repeat(250) }, 'ok\n[exit code 0]');
    expect(wrapper.find('[data-test="call-title"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="call-description"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="call-command"]').text()).toBe(`${'c'.repeat(200)}…`);
    wrapper.unmount();
  });

  it("QA9-E8 and QA10-H8 a shell call's card shows its title, description, and command, with no exit chip", async () => {
    const result = message('toolResult', { role: 'toolResult', toolCallId: 'c1', toolName: 'bash', content: [{ type: 'text', text: 'ok\n[exit code 0]' }], isError: false, details: { title: 'Run the tests', description: 'Checks the page.', command: 'npm test', exitCode: 0, output: 'ok', durationMs: 900 } });
    const wrapper = await mounted(MessageItem, createFakeKvman(), { message: result, calls: new Map() });
    expect(wrapper.find('[data-test="call-title"]').text()).toBe('Run the tests');
    expect(wrapper.find('[data-test="call-description"]').text()).toBe('Checks the page.');
    expect(wrapper.find('[data-test="call-command"]').text()).toBe('npm test');
    expect(wrapper.find('[data-test="exit-code"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="shell-result"]').text()).not.toContain('exit');
    expect(wrapper.find('[data-test="shell-result"]').text()).toContain('0.9 s');
    await opened(wrapper);
    expect(wrapper.find('[data-test="shell-command"]').text()).toBe('npm test');
    expect(wrapper.find('[data-test="shell-output"]').text()).toBe('ok');
    wrapper.unmount();
  });

  it('QA10-H8 a card with exit code 1 has no exit chip either, and still shows the time', async () => {
    const wrapper = await card({ description: 'Run the tests.', command: 'npm test' }, 'FAIL 1\n[exit code 1]');
    expect(wrapper.find('[data-test="exit-code"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="shell-result"]').text()).not.toContain('exit');
    await opened(wrapper);
    expect(wrapper.find('[data-test="shell-output"]').text()).toBe('FAIL 1');
    wrapper.unmount();
  });

  it('QA10-H9 a failed call has a danger border: exit code 1, and an error text ending [exit code 1]; exit code 0 has none', async () => {
    const failed = await card({ description: 'Run the tests.', command: 'npm test' }, 'FAIL 1\n[exit code 1]');
    expect(failed.find('[data-test="shell-result"]').classes()).toContain('kvc-failed');
    failed.unmount();

    const errorText = message('toolResult', { role: 'toolResult', toolCallId: 'c1', toolName: 'bash', content: [{ type: 'text', text: 'denied\n[exit code 1]' }], isError: true });
    const errored = await mounted(MessageItem, createFakeKvman(), { message: errorText, calls: new Map() });
    expect(errored.find('[data-test="shell-result"]').classes()).toContain('kvc-failed');
    errored.unmount();

    const ok = await card({ description: 'Run the tests.', command: 'npm test' }, 'ok\n[exit code 0]');
    expect(ok.find('[data-test="shell-result"]').classes()).not.toContain('kvc-failed');
    ok.unmount();
  });

  it('QA10-E7 a card without an exit code has no failure border', async () => {
    const wrapper = await card({ description: 'List the folder.', command: 'ls -la' }, 'total 0');
    expect(wrapper.find('[data-test="shell-result"]').classes()).not.toContain('kvc-failed');
    wrapper.unmount();
  });

  it('QA9-E15 an assistant message that only calls a tool renders nothing, and one with text or thinking renders as before', async () => {
    const calling = message('assistant', { role: 'assistant', content: [{ type: 'toolCall', id: 'c1', name: 'bash', arguments: { command: 'ls', risky: false } }] });
    const silent = await mounted(MessageItem, createFakeKvman(), { message: calling, calls: new Map() });
    expect(silent.find('[data-test="assistant-message"]').exists()).toBe(false);
    silent.unmount();

    const thinking = message('assistant', { role: 'assistant', content: [{ type: 'thinking', thinking: 'Plan it.' }, { type: 'toolCall', id: 'c2', name: 'bash', arguments: { command: 'ls', risky: false } }] });
    const thoughtful = await mounted(MessageItem, createFakeKvman(), { message: thinking, calls: new Map() });
    expect(thoughtful.find('[data-test="thinking"]').text()).toContain('Plan it.');
    thoughtful.unmount();

    const text = message('assistant', { role: 'assistant', content: [{ type: 'text', text: 'Done.' }] });
    const said = await mounted(MessageItem, createFakeKvman(), { message: text, calls: new Map() });
    expect(said.find('[data-test="assistant-message"]').text()).toContain('Done.');
    said.unmount();
  });
});

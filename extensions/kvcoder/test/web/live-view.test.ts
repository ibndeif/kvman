import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ConversationView from '../../web/src/ConversationView.vue';
import { createFakeKvman, progress } from './support/fake-kvman.ts';
import { answer, message, mounted, serve, session, turn, user } from './support/fixtures.ts';

afterEach(() => {
  vi.useRealTimers();
});

const running = () => ({ found: session({ status: 'running', stepJobId: 'j1' }), messages: [user('go')], omitted: 0, turns: [turn()] });
const activity = (wrapper: Awaited<ReturnType<typeof mounted>>) => wrapper.find('[data-test="activity"]');
const kvai = (data: Record<string, unknown>) => progress('@kvman/kvai', data as never);

describe('the live view of a running step (08 §8.7, ADR 0009, 142, 143)', () => {
  it('QA3-H3 and QA3-H4 the activity line follows waiting, thinking (open), writing (folded), a call being written, and its running; and goes when the step ends', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    const fake = createFakeKvman();
    const world = running();
    serve(fake, world);
    const wrapper = await mounted(ConversationView, fake, { sessionId: 's1' });

    expect(activity(wrapper).find('[data-test="activity-title"]').text()).toBe('Waiting for the model…');
    expect(activity(wrapper).find('[data-test="activity-seconds"]').text()).toBe('0 s');
    vi.advanceTimersByTime(3000);
    await flushPromises();
    expect(activity(wrapper).find('[data-test="activity-seconds"]').text()).toBe('3 s');

    fake.emit('j1', kvai({ type: 'thinking', delta: 'The user wants a file.' }));
    await flushPromises();
    expect(activity(wrapper).find('[data-test="activity-title"]').text()).toBe('Thinking…');
    expect(wrapper.find('[data-test="live-thinking"]').attributes('open')).toBeDefined();
    expect(wrapper.find('[data-test="live-thinking"]').text()).toContain('The user wants a file.');

    fake.emit('j1', kvai({ type: 'text', delta: 'I will create it.' }));
    await flushPromises();
    expect(activity(wrapper).find('[data-test="activity-title"]').text()).toBe('Writing…');
    expect(wrapper.find('[data-test="live-thinking"]').attributes('open')).toBeUndefined();

    fake.emit('j1', kvai({ type: 'toolcall', name: 'bash' }));
    await flushPromises();
    expect(activity(wrapper).find('[data-test="activity-title"]').text()).toBe('Preparing a command…');
    fake.emit('j1', kvai({ type: 'toolcall', name: 'bash', arguments: { title: 'Create the todo file' } }));
    fake.emit('j1', kvai({ type: 'toolcall', name: 'bash', arguments: { title: 'Create the todo file', description: 'Writes todo.txt so you can see it.' } }));
    await flushPromises();
    expect(activity(wrapper).find('[data-test="activity-title"]').text()).toBe('Create the todo file');
    expect(activity(wrapper).find('[data-test="activity-description"]').text()).toBe('Writes todo.txt so you can see it.');
    expect(activity(wrapper).attributes('data-phase')).toBe('preparing');

    fake.emit('j1', kvai({ type: 'toolcall', name: 'bash', arguments: { title: 'Create the todo file', description: 'Writes todo.txt so you can see it.', command: 'touch todo.txt' } }));
    await flushPromises();
    expect(activity(wrapper).attributes('data-phase')).toBe('running');
    expect(activity(wrapper).find('[data-test="activity-phase"]').text()).toBe('Running…');

    world.found = session({ status: 'idle' });
    world.messages = [user('go'), answer('Done.')];
    fake.end('j1');
    await flushPromises();
    expect(activity(wrapper).exists()).toBe(false);
    wrapper.unmount();
  });

  it('QA3-E6 a page that attaches mid-step shows the activity and the chunks replayed to it', async () => {
    const fake = createFakeKvman();
    fake.emit('j1', kvai({ type: 'text', delta: 'First words. ' }));
    fake.emit('j1', kvai({ type: 'toolcall', name: 'bash' }));
    fake.emit('j1', kvai({ type: 'toolcall', name: 'bash', arguments: { title: 'Read the folder' } }));
    serve(fake, running());
    const wrapper = await mounted(ConversationView, fake, { sessionId: 's1' });
    expect(wrapper.find('[data-test="live-answer"]').text()).toContain('First words.');
    expect(activity(wrapper).find('[data-test="activity-title"]').text()).toBe('Read the folder');
    wrapper.unmount();
  });

  it('QA3-H5 a stored result card shows the call\'s title, description, and command, and QA3-E5 one with no title shows its command', async () => {
    const fake = createFakeKvman();
    const labelled = { type: 'toolCall', id: 'c1', name: 'bash', arguments: { title: 'Run the tests', description: 'Checks the page.', command: 'npm test' } };
    const bare = { type: 'toolCall', id: 'c2', name: 'bash', arguments: { command: 'ls -la', description: 'Lists.' } };
    const messages = [
      user('go'),
      message('assistant', { role: 'assistant', content: [labelled, bare] }),
      message('toolResult', { role: 'toolResult', toolCallId: 'c1', toolName: 'bash', content: [{ type: 'text', text: 'ok\n[exit code 0]' }], isError: false, details: { title: 'Run the tests', description: 'Checks the page.', command: 'npm test', exitCode: 0, output: 'ok', durationMs: 900 } }),
      message('toolResult', { role: 'toolResult', toolCallId: 'c2', toolName: 'bash', content: [{ type: 'text', text: 'a\n[exit code 0]' }], isError: false, details: { command: 'ls -la', exitCode: 0, output: 'a', durationMs: 20 } }),
    ];
    serve(fake, { found: session(), messages, omitted: 0, turns: [turn()] });
    const wrapper = await mounted(ConversationView, fake, { sessionId: 's1' });
    const [first, second] = wrapper.findAll('[data-test="shell-result"]');
    expect(first?.find('[data-test="call-title"]').text()).toBe('Run the tests');
    expect(first?.find('[data-test="call-description"]').text()).toBe('Checks the page.');
    expect(first?.find('[data-test="call-command"]').text()).toBe('npm test');
    expect(second?.find('[data-test="call-title"]').exists()).toBe(false);
    expect(second?.find('[data-test="call-description"]').exists()).toBe(false);
    expect(second?.find('[data-test="call-command"]').text()).toBe('ls -la');
    wrapper.unmount();
  });
});

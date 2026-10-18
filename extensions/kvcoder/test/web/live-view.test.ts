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

    fake.emit('j1', kvai({ type: 'toolcall', name: 'run' }));
    await flushPromises();
    expect(activity(wrapper).find('[data-test="activity-title"]').text()).toBe('Preparing a command…');
    fake.emit('j1', kvai({ type: 'toolcall', name: 'run', arguments: { description: 'Creating the todo file' } }));
    fake.emit('j1', kvai({ type: 'toolcall', name: 'run', arguments: { description: 'Creating the todo file', connector: 'fs', command: 'write' } }));
    await flushPromises();
    expect(activity(wrapper).find('[data-test="activity-title"]').text()).toBe('Creating the todo file');
    expect(activity(wrapper).find('[data-test="activity-label"]').text()).toBe('fs · write');
    expect(activity(wrapper).attributes('data-phase')).toBe('preparing');

    fake.emit('j1', kvai({ type: 'toolcall', name: 'run', arguments: { description: 'Creating the todo file', connector: 'fs', command: 'write', payload: { path: 'todo.txt', content: '' } } }));
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
    fake.emit('j1', kvai({ type: 'toolcall', name: 'run' }));
    fake.emit('j1', kvai({ type: 'toolcall', name: 'run', arguments: { description: 'Reading the folder' } }));
    serve(fake, running());
    const wrapper = await mounted(ConversationView, fake, { sessionId: 's1' });
    expect(wrapper.find('[data-test="live-answer"]').text()).toContain('First words.');
    expect(activity(wrapper).find('[data-test="activity-title"]').text()).toBe('Reading the folder');
    wrapper.unmount();
  });

  it("QA3-H5 a stored result card shows the call's description and its line (ADR 0036, 2), and QA3-E5 an old one with no words shows its command", async () => {
    const fake = createFakeKvman();
    const labelled = { type: 'toolCall', id: 'c1', name: 'run', arguments: { description: 'Running the tests.', connector: 'shell', command: 'exec', payload: { line: 'npm test' } } };
    const bare = { type: 'toolCall', id: 'c2', name: 'bash', arguments: { command: 'ls -la' } };
    const messages = [
      user('go'),
      message('assistant', { role: 'assistant', content: [labelled, bare] }),
      message('toolResult', { role: 'toolResult', toolCallId: 'c1', toolName: 'run', content: [{ type: 'text', text: 'ok\n[exit code 0]' }], isError: false, details: { description: 'Running the tests.', connector: 'shell', command: 'exec', exitCode: 0, output: 'ok', durationMs: 900 } }),
      message('toolResult', { role: 'toolResult', toolCallId: 'c2', toolName: 'bash', content: [{ type: 'text', text: 'a\n[exit code 0]' }], isError: false, details: { command: 'ls -la', exitCode: 0, output: 'a', durationMs: 20 } }),
    ];
    serve(fake, { found: session(), messages, omitted: 0, turns: [turn()] });
    const wrapper = await mounted(ConversationView, fake, { sessionId: 's1' });
    const [first, second] = wrapper.findAll('[data-test="call-card"]');
    expect(first?.find('[data-test="call-description"]').text()).toBe('Running the tests.');
    expect(first?.find('[data-test="call-subject"]').text()).toBe('$ npm test');
    expect(second?.find('[data-test="call-description"]').exists()).toBe(false);
    expect(second?.find('[data-test="call-label"]').exists()).toBe(false);
    expect(second?.find('[data-test="call-line"]').text()).toBe('ls -la');
    wrapper.unmount();
  });

  it("M2.4-E181 a retry drops the failed attempt's partial text, thinking, and call, so the new reply stands alone", async () => {
    const fake = createFakeKvman();
    serve(fake, running());
    const wrapper = await mounted(ConversationView, fake, { sessionId: 's1' });
    fake.emit('j1', kvai({ type: 'thinking', delta: 'First thoughts' }));
    fake.emit('j1', kvai({ type: 'text', delta: 'A reply that broke off' }));
    fake.emit('j1', kvai({ type: 'toolcall', name: 'run' }));
    await flushPromises();
    expect(wrapper.find('[data-test="live-answer"]').text()).toContain('A reply that broke off');
    fake.emit('j1', progress('@kvman/kvcoder', { type: 'retry', attempt: 2, of: 4 } as never));
    await flushPromises();
    expect(wrapper.find('[data-test="live-answer"]').exists()).toBe(false);
    expect(activity(wrapper).attributes('data-phase')).toBe('retrying');
    fake.emit('j1', kvai({ type: 'text', delta: 'The whole reply.' }));
    await flushPromises();
    expect(wrapper.find('[data-test="live-answer"]').text()).toBe('The whole reply.');
    wrapper.unmount();
  });

  it('QA3-H23 and QA55-H9 a retry chunk says why and after how long, until the model answers again', async () => {
    const fake = createFakeKvman();
    serve(fake, running());
    const wrapper = await mounted(ConversationView, fake, { sessionId: 's1' });
    fake.emit('j1', progress('@kvman/kvcoder', { type: 'retry', attempt: 3, of: 5, waitMs: 15_000, reason: 'rateLimited' } as never));
    await flushPromises();
    expect(activity(wrapper).attributes('data-phase')).toBe('retrying');
    expect(activity(wrapper).find('[data-test="activity-title"]').text()).toBe('Retrying in 15 s: the provider is limiting calls (3 of 5)');
    fake.emit('j1', progress('@kvman/kvcoder', { type: 'retry', attempt: 3, of: 5, waitMs: 15_000, reason: 'unavailable' } as never));
    await flushPromises();
    expect(activity(wrapper).find('[data-test="activity-title"]').text()).toBe("Retrying in 15 s: the provider didn't answer (3 of 5)");
    fake.emit('j1', kvai({ type: 'text', delta: 'Here it is.' }));
    await flushPromises();
    expect(activity(wrapper).attributes('data-phase')).toBe('writing');
    wrapper.unmount();
  });

  it('QA9-H11 a call shows its whole description as soon as it has one, not the preparing text', async () => {
    const fake = createFakeKvman();
    serve(fake, running());
    const wrapper = await mounted(ConversationView, fake, { sessionId: 's1' });
    const description = 'D'.repeat(80);
    fake.emit('j1', kvai({ type: 'toolcall', name: 'run' }));
    fake.emit('j1', kvai({ type: 'toolcall', name: 'run', arguments: { description } }));
    await flushPromises();
    expect(activity(wrapper).find('[data-test="activity-title"]').text()).toBe(description);
    expect(activity(wrapper).find('[data-test="activity-label"]').exists()).toBe(false);
    wrapper.unmount();
  });
  it("M2.4-E193 the running line shows the turn's steps and estimated cost so far; steps alone while nothing is priced; nothing before the first step", async () => {
    const fake = createFakeKvman();
    const world = running();
    world.turns = [turn({ steps: 18, usage: { input: 9000, output: 400, cacheRead: 0, cacheWrite: 0, cost: 0.84 } })];
    serve(fake, world);
    const wrapper = await mounted(ConversationView, fake, { sessionId: 's1' });
    expect(activity(wrapper).find('[data-test="activity-turn"]').text()).toMatch(/^Turn: 18 steps · about .?\$0\.84.?$/u);
    wrapper.unmount();

    for (const [steps, text] of [[4, 'Turn: 4 steps'], [0, undefined]] as const) {
      const free = createFakeKvman();
      serve(free, { ...running(), turns: [turn({ steps, usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 } })] });
      const shown = await mounted(ConversationView, free, { sessionId: 's1' });
      const line = activity(shown).find('[data-test="activity-turn"]');
      expect(line.exists() ? line.text() : undefined).toBe(text);
      shown.unmount();
    }
  });
});

import { describe, expect, it, vi } from 'vitest';
import ConversationView from '../../web/src/ConversationView.vue';
import { resultCard } from '../../web/src/message-parts.ts';
import { createFakeKvman } from './support/fake-kvman.ts';
import { answer, message, mounted, serve, session, turn, user } from './support/fixtures.ts';

describe('the conversation shows its messages (08 §8.7)', () => {
  it('M2.4-E56 notices, notes, earlier messages with export, a summary, background results, shell results, and totals', async () => {
    const fake = createFakeKvman();
    const call = { type: 'toolCall', id: 'c1', name: 'bash', arguments: { command: 'npm test', description: 'Test.' } };
    const messages = [
      user('go'),
      message('assistant', { role: 'assistant', content: [{ type: 'thinking', thinking: 'Plan it' }, { type: 'text', text: 'Running the tests.' }, call] }, { turnId: 't1' }),
      message('toolResult', { role: 'toolResult', toolCallId: 'c1', toolName: 'bash', content: [{ type: 'text', text: 'FAIL 1\n[exit code 1]' }], isError: true, details: { command: 'npm test', exitCode: 1, output: 'FAIL 1', durationMs: 4200 } }),
      answer('One test fails.', { turnId: 't1' }),
      message('notice', { code: 'STEP_FAILED', params: { code: 'kvai/RATE_LIMITED' } }),
      message('note', { key: 'kvcoder.ui.newChat' }),
      message('summary', { text: 'We set up the notes page.', coversThroughSeq: 3 }),
      user('The background call `todo wait --async` finished:\n{}', { source: { kind: 'job', jobId: 'j9' } }),
    ];
    serve(fake, { found: session(), messages, omitted: 3, turns: [turn({ outcome: 'done', endedAt: '2026-10-01T09:01:00.000Z' })] });
    const assign = vi.fn();
    vi.stubGlobal('location', { assign });
    fake.handle('kvcoder.session.export', () => ({ fileId: 'f1' }));
    const wrapper = await mounted(ConversationView, fake, { sessionId: 's1' });

    expect(wrapper.find('[data-test="session-title"]').text()).toBe('Notes page');
    expect(wrapper.find('[data-test="session-totals"]').text()).toBe('48 s · $0.02');
    expect(wrapper.find('[data-test="thinking"]').text()).toContain('Plan it');
    expect(wrapper.findAll('[data-test="markdown"]').map((node) => node.text())).toContain('Running the tests.');
    const shell = wrapper.find('[data-test="call-card"]');
    expect(shell.text()).toContain('Test.');
    expect(shell.classes()).toContain('kvc-failed');
    expect(shell.find('[data-test="exit-code"]').exists()).toBe(false);
    expect(shell.find('[data-test="call-output"]').text()).toBe('FAIL 1');
    expect(wrapper.findAll('[data-test="turn-totals"]').map((node) => node.text())).toEqual(['12 s · $0.02']);
    expect(wrapper.find('[data-test="turn-totals"]').attributes('title')).toBe('1.5K tokens used');
    expect(wrapper.find('[data-test="notice"]').text()).toBe('The turn stopped: kvai.errors.RATE_LIMITED');
    expect(wrapper.find('[data-test="note"]').text()).toContain('New chat');
    expect(wrapper.find('[data-test="summary"]').text()).toContain('Earlier messages were summarized');
    expect(wrapper.find('[data-test="background-result"]').text()).toContain('Background job finished');
    await wrapper.find('[data-test="earlier"]').trigger('click');
    expect(wrapper.find('[data-test="earlier"]').text()).toBe('3 earlier messages · Export');
    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith('/api/files/f1?workspaceId=home'));
    vi.unstubAllGlobals();
    wrapper.unmount();
  });

  it("M2.4-H8 and QA33-E6 a note shows in the person's language, under a title that is shown as it is", async () => {
    const fake = createFakeKvman();
    fake.language.value = 'ar';
    serve(fake, { found: session({ title: 'Notes page' }), messages: [message('note', { key: 'kvcoder.ui.newChat' })], omitted: 0, turns: [] });
    const wrapper = await mounted(ConversationView, fake, { sessionId: 's1' });
    expect(wrapper.find('[data-test="session-title"]').text()).toBe('Notes page');
    expect(wrapper.find('[data-test="note"]').text()).toContain('محادثة جديدة');
    wrapper.unmount();
  });

  it('QA46-E4 a result shows its stored output, else its text, and only an old result loses its exit-code line', () => {
    const result = (text: string, details?: Record<string, string | number>) =>
      resultCard(message('toolResult', { role: 'toolResult', toolCallId: 'c1', toolName: 'run', content: [{ type: 'text', text }], isError: false, ...(details === undefined ? {} : { details }) }), new Map()).output;
    expect(result('hi\n[exit code 0]', { connector: 'shell', command: 'exec', output: 'hi', exitCode: 0 })).toBe('hi');
    expect(result('the tool said\n[exit code 3]', { connector: 'mcp', command: 'call' })).toBe('the tool said\n[exit code 3]');
    expect(result('old output\n[exit code 3]')).toBe('old output');
  });
});

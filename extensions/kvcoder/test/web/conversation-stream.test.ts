import { flushPromises } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import ConversationView from '../../web/src/ConversationView.vue';
import { createFakeKvman, progress } from './support/fake-kvman.ts';
import { answer, mounted, serve, session, turn, user } from './support/fixtures.ts';

describe('the conversation streams a step (08 §8.7, ADR 0009, 99)', () => {
  it('M2.4-E55 deltas, folded thinking, a question card, follow chunks, compaction, and a subagent card', async () => {
    const fake = createFakeKvman();
    const world = { found: session({ status: 'running', stepJobId: 'j1' }), messages: [user('go')], omitted: 0, turns: [turn()] };
    serve(fake, world);
    const wrapper = await mounted(ConversationView, fake, { sessionId: 's1' });

    fake.emit('j1', progress('@kvman/kvai', { type: 'thinking', delta: 'Let me see' }));
    fake.emit('j1', progress('@kvman/kvai', { type: 'text', delta: 'Hel' }));
    fake.emit('j1', progress('@kvman/kvai', { type: 'text', delta: 'lo' }));
    await flushPromises();
    expect(wrapper.find('[data-test="live-answer"] [data-test="markdown"]').text()).toBe('Hello');
    expect(wrapper.find('[data-test="live-answer"] details').attributes('open')).toBeUndefined();
    expect(wrapper.find('[data-test="live-answer"] details').text()).toContain('Let me see');

    fake.emit('j1', progress('@kvman/kvcoder', { type: 'compaction', state: 'started' }));
    fake.emit('j1', progress('@kvman/kvai', { type: 'text', delta: 'SUMMARY TEXT' }));
    await flushPromises();
    expect(wrapper.find('[data-test="summarizing"]').text()).toBe('Summarizing earlier messages…');
    expect(wrapper.text()).not.toContain('SUMMARY TEXT');
    fake.emit('j1', progress('@kvman/kvcoder', { type: 'compaction', state: 'done' }));
    await flushPromises();
    expect(wrapper.find('[data-test="summarizing"]').exists()).toBe(false);

    world.found = session({ status: 'waiting' });
    world.turns = [turn({ pending: [{ toolCallId: 'c1', kind: 'question', questionId: 'q1', question: { kind: 'text', prompt: 'Name?' }, childSessionId: null }] })];
    fake.emit('j1', progress('@kvman/kvcoder', { type: 'component', component: 'kvcoder.question', props: { questionId: 'q1' } }));
    await flushPromises();
    expect(wrapper.find('[data-test="question-card"]').text()).toContain('Name?');

    world.found = session({ status: 'running', stepJobId: 'j2' });
    world.messages = [user('go'), answer('Hello')];
    world.turns = [turn()];
    fake.emit('j1', progress('@kvman/kvcoder', { type: 'follow', jobId: 'j2' }));
    fake.end('j1');
    await flushPromises();
    fake.emit('j2', progress('@kvman/kvai', { type: 'text', delta: 'Next step' }));
    await flushPromises();
    expect(wrapper.find('[data-test="live-answer"]').text()).toBe('Next step');

    world.found = session({ status: 'waiting' });
    world.turns = [turn({ pending: [{ toolCallId: 'c2', kind: 'subagent', questionId: null, question: null, childSessionId: 'child' }] })];
    fake.emit('j2', progress('@kvman/kvcoder', { type: 'subagent', sessionId: 'child', jobId: 'cj1' }));
    await flushPromises();
    fake.emit('cj1', progress('@kvman/kvai', { type: 'text', delta: 'Child is reading files' }));
    await vi.waitFor(() => expect(wrapper.find('[data-test="subagent-card"]').text()).toContain('Child is reading files'));
    expect(wrapper.find('[data-test="subagent-card"]').text()).toContain('Helper task');
    wrapper.unmount();
  });
});

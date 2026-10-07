import { flushPromises } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import ConversationView from '../../web/src/ConversationView.vue';
import { createFakeKvman, progress } from './support/fake-kvman.ts';
import { answer, message, mounted, serve, session, turn, user } from './support/fixtures.ts';

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

  it("QA31-H17 a subagent's card names its worker beside the task", async () => {
    const fake = createFakeKvman();
    const pending = [{ toolCallId: 'c2', kind: 'subagent' as const, questionId: null, question: null, childSessionId: 'child' }];
    const world = { found: session({ status: 'waiting' }), messages: [user('go')], omitted: 0, turns: [turn({ pending })] };
    serve(fake, world);
    fake.handle('kvcoder.session.get', (input) => (input['sessionId'] === 'child' ? session({ id: 'child', title: 'Review the diff', parentId: 's1', worker: 'reviewer', status: 'running' }) : world.found));
    const wrapper = await mounted(ConversationView, fake, { sessionId: 's1' });
    await vi.waitFor(() => expect(wrapper.find('[data-test="subagent-worker"]').text()).toBe('reviewer'));
    expect(wrapper.find('[data-test="subagent-card"]').text()).toContain('Review the diff');
    wrapper.unmount();
  });

  it("QA49-H2 a subagent's card shows the title its run was given, its worker, and the first line of its task", async () => {
    const fake = createFakeKvman();
    const pending = [{ toolCallId: 'c2', kind: 'subagent' as const, questionId: null, question: null, childSessionId: 'child' }];
    const asked = message('assistant', { role: 'assistant', content: [{ type: 'toolCall', id: 'c2', name: 'run', arguments: { description: 'Designing the page', connector: 'delegate', command: 'run', payload: { worker: 'ui-ux', title: 'UI expert', task: 'Design the empty state of the notes page.\nShow it in an artifact.' } } }] });
    const world = { found: session({ status: 'waiting' }), messages: [user('go'), asked], omitted: 0, turns: [turn({ pending })] };
    serve(fake, world);
    fake.handle('kvcoder.session.get', (input) => (input['sessionId'] === 'child' ? session({ id: 'child', title: 'UI expert', parentId: 's1', worker: 'ui-ux', status: 'running' }) : world.found));
    const wrapper = await mounted(ConversationView, fake, { sessionId: 's1' });
    await vi.waitFor(() => expect(wrapper.find('[data-test="subagent-title"]').text()).toBe('UI expert'));
    expect(wrapper.find('[data-test="subagent-worker"]').text()).toBe('ui-ux');
    expect(wrapper.find('[data-test="subagent-task"]').text()).toBe('Design the empty state of the notes page.');
    wrapper.unmount();
  });

  it('QA49-E3 a card whose call is not among the messages shows no task line', async () => {
    const fake = createFakeKvman();
    const pending = [{ toolCallId: 'c2', kind: 'subagent' as const, questionId: null, question: null, childSessionId: 'child' }];
    const world = { found: session({ status: 'waiting' }), messages: [user('go')], omitted: 0, turns: [turn({ pending })] };
    serve(fake, world);
    fake.handle('kvcoder.session.get', (input) => (input['sessionId'] === 'child' ? session({ id: 'child', title: 'UI expert', parentId: 's1', worker: 'ui-ux', status: 'running' }) : world.found));
    const wrapper = await mounted(ConversationView, fake, { sessionId: 's1' });
    await vi.waitFor(() => expect(wrapper.find('[data-test="subagent-title"]').text()).toBe('UI expert'));
    expect(wrapper.find('[data-test="subagent-task"]').exists()).toBe(false);
    wrapper.unmount();
  });
});

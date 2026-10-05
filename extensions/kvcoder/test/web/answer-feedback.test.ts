import { flushPromises } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ConversationView from '../../web/src/ConversationView.vue';
import { createFakeKvman, progress } from './support/fake-kvman.ts';
import { mounted, serve, session, turn, user } from './support/fixtures.ts';

const confirm = { toolCallId: 'c1', kind: 'question' as const, questionId: 'q1', question: { kind: 'confirm', prompt: 'Go on?' }, childSessionId: null };
const approval = { toolCallId: 'c2', kind: 'approval' as const, questionId: 'a1', question: { description: 'Creating the todo file', connector: 'shell', command: 'exec', payload: { line: 'touch todo.txt' } }, childSessionId: null };

const waiting = (pending: (typeof confirm | typeof approval)[]) => ({ found: session({ status: 'waiting' }), messages: [user('go')], omitted: 0, turns: [turn({ pending })] });
const reads = (fake: ReturnType<typeof createFakeKvman>) => fake.calls.filter((call) => call.name === 'kvcoder.session.get').length;
const problem = (code: string) => Object.assign(new Error(code), { problem: { code, message: code } });

describe('an answer is felt at once (08 §8.5, ADR 0009, 141)', () => {
  it('QA3-H2 the card is gone before the answer returns, and the next step shows as soon as it does', async () => {
    const fake = createFakeKvman();
    const world = waiting([confirm]);
    serve(fake, world);
    let finish: (value: { jobId: string }) => void = () => undefined;
    fake.handle('kvcoder.question.answer', () => new Promise((resolve) => (finish = resolve)));
    const wrapper = await mounted(ConversationView, fake, { sessionId: 's1' });
    await wrapper.find('[data-test="answer-yes"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-test="question-card"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('Go on?');

    const before = reads(fake);
    world.found = session({ status: 'running', stepJobId: 'j2' });
    world.turns = [turn()];
    finish({ jobId: 'j2' });
    await flushPromises();
    expect(reads(fake)).toBeGreaterThan(before);
    expect(wrapper.find('[data-test="activity"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="question-card"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('QA3-H2 an allowed command shows as running in the next step until the model speaks', async () => {
    const fake = createFakeKvman();
    const world = waiting([approval]);
    serve(fake, world);
    fake.handle('kvcoder.question.answer', () => {
      world.found = session({ status: 'running', stepJobId: 'j2' });
      world.turns = [turn()];
      return { jobId: 'j2' };
    });
    const wrapper = await mounted(ConversationView, fake, { sessionId: 's1' });
    await wrapper.find('[data-test="allow"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-test="approvals-card"]').exists()).toBe(false);
    const line = wrapper.find('[data-test="activity"]');
    expect(line.find('[data-test="activity-title"]').text()).toBe('Creating the todo file');
    expect(line.find('[data-test="activity-label"]').text()).toBe('shell · exec');
    expect(line.attributes('data-phase')).toBe('running');
    fake.emit('j2', progress('@kvman/kvai', { type: 'text', delta: 'Created.' }));
    await flushPromises();
    expect(wrapper.find('[data-test="activity"]').attributes('data-phase')).toBe('writing');
    wrapper.unmount();
  });

  it('QA3-E3 a failed answer brings the card back, enabled, with the toast', async () => {
    const fake = createFakeKvman();
    serve(fake, waiting([confirm]));
    fake.handle('kvcoder.question.answer', () => {
      throw problem('kvcoder/ANSWER_INVALID');
    });
    const wrapper = await mounted(ConversationView, fake, { sessionId: 's1' });
    await wrapper.find('[data-test="answer-yes"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-test="question-card"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="answer-yes"]').attributes('disabled')).toBeUndefined();
    expect(fake.toast).toHaveBeenCalledWith('kvcoder.errors.ANSWER_INVALID', {}, 'error');
    wrapper.unmount();
  });

  it('QA3-E4 an answer someone else took drops the card quietly and reads the session', async () => {
    const fake = createFakeKvman();
    const world = waiting([confirm]);
    serve(fake, world);
    fake.handle('kvcoder.question.answer', () => {
      world.found = session({ status: 'idle' });
      world.turns = [turn()];
      throw problem('kvcoder/QUESTION_NOT_FOUND');
    });
    const wrapper = await mounted(ConversationView, fake, { sessionId: 's1' });
    const before = reads(fake);
    await wrapper.find('[data-test="answer-yes"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-test="question-card"]').exists()).toBe(false);
    expect(fake.toast).not.toHaveBeenCalled();
    expect(reads(fake)).toBeGreaterThan(before);
    wrapper.unmount();
  });

  it('QA3-H2 Allow all answers each approval in order and the last one starts the next step', async () => {
    const fake = createFakeKvman();
    const second = { ...approval, toolCallId: 'c3', questionId: 'a2', question: { ...approval.question, description: 'Building it', payload: { line: 'npm run build' } } };
    const world = waiting([approval, second]);
    serve(fake, world);
    let taken = 0;
    fake.handle('kvcoder.question.answer', () => {
      taken += 1;
      if (taken < 2) return { jobId: null };
      world.found = session({ status: 'running', stepJobId: 'j2' });
      world.turns = [turn()];
      return { jobId: 'j2' };
    });
    const wrapper = await mounted(ConversationView, fake, { sessionId: 's1' });
    await wrapper.find('[data-test="allow-all"]').trigger('click');
    await flushPromises();
    expect(fake.calls.filter((call) => call.name === 'kvcoder.question.answer').map((call) => call.input)).toEqual([
      { questionId: 'a1', answer: { confirmed: true } },
      { questionId: 'a2', answer: { confirmed: true } },
    ]);
    expect(wrapper.findAll('[data-test="activity-title"]').map((title) => title.text())).toEqual(['Creating the todo file', 'Building it']);
    wrapper.unmount();
  });
});

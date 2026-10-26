import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ConversationHeader from '../../web/src/ConversationHeader.vue';
import ConversationView from '../../web/src/ConversationView.vue';
import { createFakeKvman } from './support/fake-kvman.ts';
import { job, mounted, serve, session, turn, user } from './support/fixtures.ts';

// A background helper's decisions show in the chat, whatever the lead is doing (plan 08 §8.7, ADR 0085, 1 and 2).

afterEach(() => vi.useRealTimers());

const approval = { toolCallId: 'c9', kind: 'approval' as const, questionId: 'a9', question: { description: 'Say hi in the shell', connector: 'shell', command: 'exec', payload: { line: 'echo hi', risky: true } }, childSessionId: null };
const helperTurn = turn({ id: 'th', sessionId: 'h1', pending: [approval] });
const helperSession = session({ id: 'h1', parentId: 's1', title: 'Build checker', status: 'waiting' });

function world(jobs: ReturnType<typeof job>[], lead = session(), turns = [turn()]) {
  const fake = createFakeKvman();
  serve(fake, { found: lead, messages: [user('go')], omitted: 0, turns, jobs });
  fake.handle('kvcoder.session.get', (input) => (input['sessionId'] === 'h1' ? helperSession : input['sessionId'] === 'f1' ? session({ id: 'f1', parentId: 's1', title: 'Foreground helper', status: 'waiting' }) : lead));
  fake.handle('kvcoder.turn.list', (input) => (input['sessionId'] === 'h1' ? [helperTurn] : input['sessionId'] === 'f1' ? [turn({ id: 'tf', sessionId: 'f1', pending: [{ ...approval, questionId: 'a8' }] })] : turns));
  fake.handle('kvcoder.question.answer', () => ({ jobId: 'jh' }));
  return fake;
}

const waitingJob = job({ id: 'h1', kind: 'subagent', title: 'Build checker', call: 'Checking the build in the background', status: 'waiting' });

describe("a background helper's decision in the chat (ADR 0085, 1)", () => {
  it('QA53-H9 a background helper\'s approval shows in the chat', async () => {
    const fake = world([waitingJob]);
    const wrapper = await mounted(ConversationView, fake, { sessionId: 's1' });
    expect(wrapper.find('[data-test="background-decision"]').text()).toBe('A background helper needs your decision.');
    const card = wrapper.find('[data-test="subagent-card"]');
    expect(card.find('[data-test="subagent-title"]').text()).toBe('Build checker');
    expect(card.find('[data-test="subagent-task"]').text()).toBe('Checking the build in the background');
    expect(card.text()).toContain('Say hi in the shell');
    expect(card.find('[data-test="deny"]').exists()).toBe(true);
    await card.find('[data-test="allow"]').trigger('click');
    await flushPromises();
    const answered = fake.calls.filter((call) => call.name === 'kvcoder.question.answer');
    expect(answered).toHaveLength(1);
    expect(answered[0]?.input).toMatchObject({ questionId: 'a9', answer: { confirmed: true } });
    wrapper.unmount();
  });

  it("QA53-E7 a foreground helper's approval still shows under its call", async () => {
    const foreground = { toolCallId: 'cf', kind: 'subagent' as const, questionId: null, question: null, childSessionId: 'f1' };
    const fake = world([], session({ status: 'waiting' }), [turn({ pending: [foreground] })]);
    const wrapper = await mounted(ConversationView, fake, { sessionId: 's1' });
    expect(wrapper.findAll('[data-test="subagent-card"]')).toHaveLength(1);
    expect(wrapper.find('[data-test="subagent-title"]').text()).toBe('Foreground helper');
    expect(wrapper.find('[data-test="background-decision"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('QA53-E8 a helper that only runs is not shown, and a waiting one is counted as waiting for you', async () => {
    const running = job({ id: 'h2', kind: 'subagent', title: 'Runner', call: 'Running along', status: 'running' });
    const conversation = await mounted(ConversationView, world([running]), { sessionId: 's1' });
    expect(conversation.find('[data-test="background-decision"]').exists()).toBe(false);
    expect(conversation.find('[data-test="subagent-card"]').exists()).toBe(false);
    conversation.unmount();
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'], now: Date.parse('2026-10-01T09:01:12.000Z') });
    const fake = world([running, waitingJob]);
    const header = await mounted(ConversationHeader, fake, { session: session(), tab: 'chat', turns: 1 });
    expect(header.find('[data-test="jobs-words"]').text()).toBe('2 running');
    await header.find('[data-test="jobs-chip"]').trigger('click');
    expect(header.find('[data-test="job-h1"] [data-test="job-status"]').text()).toBe('Waiting for you');
    expect(header.find('[data-test="job-stop-h1"]').exists()).toBe(true);
    header.unmount();
  });
});

import { flushPromises } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import type { Turn } from '../../src/index.ts';
import ConversationView from '../../web/src/ConversationView.vue';
import QuestionCard from '../../web/src/QuestionCard.vue';
import { createFakeKvman } from './support/fake-kvman.ts';
import { mounted, serve, session, turn, user } from './support/fixtures.ts';

const failure = () => Object.assign(new Error('offline'), { problem: { code: 'OFFLINE', message: 'offline' } });
function fixture(id: string, question: Turn['pending'][number]['question'] = { kind: 'text', prompt: 'Name?' }) {
  const fake = createFakeKvman();
  fake.workspace.value = { ...fake.workspace.value, id };
  const pending = { toolCallId: 'call', kind: 'question' as const, questionId: id, question, childSessionId: null };
  const world = { found: session({ status: 'waiting' }), messages: [user('go')], omitted: 0, turns: [turn({ pending: [pending] })] };
  serve(fake, world);
  return { fake, world };
}
const sent = (fake: ReturnType<typeof createFakeKvman>) => fake.calls.filter(call => call.name === 'kvcoder.question.answer');

describe('KVC20 question drafts (E131–E133)', () => {
  it('text survives failure and a newly created bridge/conversation, with a retry', async () => {
    const { fake, world } = fixture('draft-text');
    fake.handle('kvcoder.question.answer', () => { throw failure(); });
    let view = await mounted(ConversationView, fake, { sessionId: 's1' });
    await view.find('[data-test="answer-text"]').setValue('  Ada  ');
    await view.find('[data-test="answer"]').trigger('click');
    await flushPromises();
    expect(view.find<HTMLInputElement>('[data-test="answer-text"]').element.value).toBe('  Ada  ');
    expect(view.find('[data-test="answer-error"]').exists()).toBe(true);
    view.unmount();
    const next = createFakeKvman();
    next.workspace.value = fake.workspace.value;
    serve(next, world);
    next.handle('kvcoder.question.answer', () => ({ jobId: null }));
    view = await mounted(ConversationView, next, { sessionId: 's1' });
    expect(view.find<HTMLInputElement>('[data-test="answer-text"]').element.value).toBe('  Ada  ');
    await view.find('[data-test="answer"]').trigger('click');
    await flushPromises();
    expect(sent(next).map(call => call.input)).toEqual([{ questionId: 'draft-text', answer: { text: '  Ada  ' } }]);
    expect(view.find('[data-test="question-card"]').exists()).toBe(false);
    view.unmount();
  });

  it('selected choices and Other survive failure and navigation', async () => {
    const { fake } = fixture('draft-choice', { kind: 'choice', prompt: 'Which?', multiple: true, other: true, options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] });
    fake.handle('kvcoder.question.answer', () => { throw failure(); });
    let view = await mounted(ConversationView, fake, { sessionId: 's1' });
    await view.find('[data-test="option-a"] input').trigger('change');
    await view.find('[data-test="option-b"] input').trigger('change');
    await view.find('[data-test="answer-other"]').setValue(' C too ');
    await view.find('[data-test="answer"]').trigger('click');
    await flushPromises();
    view.unmount();
    view = await mounted(ConversationView, fake, { sessionId: 's1' });
    expect(view.find<HTMLInputElement>('[data-test="option-a"] input').element.checked).toBe(true);
    expect(view.find<HTMLInputElement>('[data-test="option-b"] input').element.checked).toBe(true);
    expect(view.find<HTMLInputElement>('[data-test="answer-other"]').element.value).toBe(' C too ');
    await view.find('[data-test="answer"]').trigger('click');
    expect(sent(fake).map(call => call.input)).toEqual(Array.from({ length: 2 }, () => ({ questionId: 'draft-choice', answer: { selected: ['a', 'b'], other: 'C too' } })));
    view.unmount();
  });

  it('stays visible and disabled, prevents Enter/click duplicates, and stays busy after remount until ACK', async () => {
    const { fake, world } = fixture('draft-busy');
    let finish: (value: { jobId: null }) => void = () => undefined;
    fake.handle('kvcoder.question.answer', () => new Promise(resolve => { finish = resolve; }));
    let view = await mounted(ConversationView, fake, { sessionId: 's1' });
    await view.find('[data-test="answer-text"]').setValue('kept');
    await view.find('[data-test="answer-text"]').trigger('keydown', { key: 'Enter' });
    expect(view.find('[data-test="question-card"]').attributes('aria-busy')).toBe('true');
    expect(view.find('[data-test="answer"]').attributes('disabled')).toBeDefined();
    await view.find('[data-test="answer-text"]').trigger('keydown', { key: 'Enter' });
    await view.find('[data-test="answer"]').trigger('click');
    view.unmount();
    const next = createFakeKvman(); next.workspace.value = fake.workspace.value; serve(next, world);
    view = await mounted(ConversationView, next, { sessionId: 's1' });
    expect(view.find('[data-test="answer-text"]').attributes('disabled')).toBeDefined();
    expect(view.find<HTMLInputElement>('[data-test="answer-text"]').element.value).toBe('kept');
    await view.find('[data-test="answer-text"]').trigger('keydown', { key: 'Enter' });
    expect(sent(fake)).toHaveLength(1); expect(sent(next)).toHaveLength(0);
    finish({ jobId: null }); await flushPromises();
    expect(view.find('[data-test="question-card"]').exists()).toBe(false);
    view.unmount();
  });

  it('isolates the same question ID across workspaces and different questions within one workspace', async () => {
    const fake = createFakeKvman(); fake.workspace.value = { ...fake.workspace.value, id: 'isolation-a' };
    const props = { questionId: 'isolated', question: { kind: 'text', prompt: 'Name?' } };
    let view = await mounted(QuestionCard, fake, props);
    await view.find('[data-test="answer-text"]').setValue('first'); view.unmount();
    fake.workspace.value = { ...fake.workspace.value, id: 'isolation-b' };
    view = await mounted(QuestionCard, fake, props);
    expect(view.find<HTMLInputElement>('[data-test="answer-text"]').element.value).toBe(''); view.unmount();
    fake.workspace.value = { ...fake.workspace.value, id: 'isolation-a' };
    view = await mounted(QuestionCard, fake, { ...props, questionId: 'other-question' });
    expect(view.find<HTMLInputElement>('[data-test="answer-text"]').element.value).toBe(''); view.unmount();
    view = await mounted(QuestionCard, fake, props);
    expect(view.find<HTMLInputElement>('[data-test="answer-text"]').element.value).toBe('first'); view.unmount();
  });

  it('authoritative cancellation clears drafts before a late failed response and does not resurrect them', async () => {
    const { fake, world } = fixture('draft-cancel');
    let reject: (error: Error) => void = () => undefined;
    fake.handle('kvcoder.question.answer', () => new Promise((_resolve, fail) => { reject = fail; }));
    let view = await mounted(ConversationView, fake, { sessionId: 's1' });
    await view.find('[data-test="answer-text"]').setValue('discard after cancellation');
    await view.find('[data-test="answer"]').trigger('click'); view.unmount();
    world.found = session({ status: 'idle' });
    world.turns = [turn({ outcome: 'cancelled', endedAt: '2026-10-12T01:00:00.000Z' })];
    view = await mounted(ConversationView, fake, { sessionId: 's1' });
    expect(view.find('[data-test="question-card"]').exists()).toBe(false);
    reject(failure()); await flushPromises(); view.unmount();
    view = await mounted(QuestionCard, fake, { questionId: 'draft-cancel', question: { kind: 'text', prompt: 'Name?' } });
    expect(view.find<HTMLInputElement>('[data-test="answer-text"]').element.value).toBe('');
    expect(fake.toast).not.toHaveBeenCalled(); view.unmount();
  });

  it('does not treat absence from the bounded turn list as proof of cancellation', async () => {
    const { fake, world } = fixture('draft-omitted');
    let view = await mounted(ConversationView, fake, { sessionId: 's1' });
    await view.find('[data-test="answer-text"]').setValue('keep without proof'); view.unmount();
    world.turns = [turn({ id: 't2' })];
    view = await mounted(ConversationView, fake, { sessionId: 's1' }); view.unmount();
    view = await mounted(QuestionCard, fake, { questionId: 'draft-omitted', question: { kind: 'text', prompt: 'Name?' } });
    expect(view.find<HTMLInputElement>('[data-test="answer-text"]').element.value).toBe('keep without proof'); view.unmount();
  });

  it('a QUESTION_NOT_FOUND response does not hide a still-authoritatively-pending question', async () => {
    const { fake } = fixture('draft-unproven');
    fake.handle('kvcoder.question.answer', () => { throw Object.assign(new Error('missing'), { problem: { code: 'kvcoder/QUESTION_NOT_FOUND' } }); });
    const view = await mounted(ConversationView, fake, { sessionId: 's1' });
    await view.find('[data-test="answer-text"]').setValue('retain for retry');
    await view.find('[data-test="answer"]').trigger('click'); await flushPromises();
    expect(view.find<HTMLInputElement>('[data-test="answer-text"]').element.value).toBe('retain for retry');
    expect(view.find('[data-test="answer"]').attributes('disabled')).toBeUndefined();
    expect(fake.toast).not.toHaveBeenCalled(); view.unmount();
  });

  it('uses the child session/turn for confirmed child-question cleanup', async () => {
    const { fake, world } = fixture('draft-child');
    world.turns = [turn({ pending: [{ toolCallId: 'delegate', kind: 'subagent', questionId: null, question: null, childSessionId: 'child' }] })];
    let childWaiting = true;
    let childTurn = turn({ id: 'child-turn', sessionId: 'child', pending: [{ toolCallId: 'ask', kind: 'question', questionId: 'child-question', question: { kind: 'text', prompt: 'Child name?' }, childSessionId: null }] });
    fake.handle('kvcoder.session.get', input => input['sessionId'] === 'child' ? session({ id: 'child', parentId: 's1', status: childWaiting ? 'waiting' : 'idle' }) : world.found);
    fake.handle('kvcoder.turn.list', input => input['sessionId'] === 'child' ? [childTurn] : world.turns);
    let view = await mounted(ConversationView, fake, { sessionId: 's1' });
    await view.find('[data-test="answer-text"]').setValue('child draft'); view.unmount();
    childWaiting = false;
    childTurn = turn({ id: 'child-turn', sessionId: 'child', outcome: 'cancelled', endedAt: '2026-10-12T01:00:00.000Z' });
    view = await mounted(ConversationView, fake, { sessionId: 's1' }); view.unmount();
    view = await mounted(QuestionCard, fake, { questionId: 'child-question', question: { kind: 'text', prompt: 'Child name?' } });
    expect(view.find<HTMLInputElement>('[data-test="answer-text"]').element.value).toBe(''); view.unmount();
  });

  it("a helper's approvals keep sending when the parent conversation is read again meanwhile", async () => {
    const { fake, world } = fixture('draft-child-approvals');
    world.turns = [turn({ pending: [{ toolCallId: 'delegate', kind: 'subagent', questionId: null, question: null, childSessionId: 'child' }] })];
    const approval = (questionId: string) => ({ toolCallId: questionId, kind: 'approval' as const, questionId, question: { connector: 'shell', command: 'exec', payload: { line: 'ls' } }, childSessionId: null });
    const childTurn = turn({ id: 'child-turn', sessionId: 'child', pending: [approval('a1'), approval('a2')] });
    fake.handle('kvcoder.session.get', input => input['sessionId'] === 'child' ? session({ id: 'child', parentId: 's1', status: 'waiting' }) : world.found);
    fake.handle('kvcoder.turn.list', input => input['sessionId'] === 'child' ? [childTurn] : world.turns);
    const finish: ((value: { jobId: null }) => void)[] = [];
    fake.handle('kvcoder.question.answer', () => new Promise(resolve => { finish.push(resolve); }));
    const view = await mounted(ConversationView, fake, { sessionId: 's1' });
    await view.find('[data-test="allow-all"]').trigger('click');
    const again = await mounted(ConversationView, fake, { sessionId: 's1' });
    finish[0]?.({ jobId: null }); await flushPromises();
    expect(sent(fake).map(call => call.input['questionId'])).toEqual(['a1', 'a2']);
    finish[1]?.({ jobId: null }); await flushPromises();
    expect(view.find('[data-test="approvals-card"]').exists()).toBe(false);
    again.unmount(); view.unmount();
  });

  it('late ACK cannot clear the same question ID in another workspace or refresh the closed conversation', async () => {
    const { fake } = fixture('draft-late');
    let finish: (value: { jobId: null }) => void = () => undefined;
    fake.handle('kvcoder.question.answer', () => new Promise(resolve => { finish = resolve; }));
    const original = await mounted(ConversationView, fake, { sessionId: 's1' });
    await original.find('[data-test="answer-text"]').setValue('old workspace');
    await original.find('[data-test="answer"]').trigger('click'); original.unmount();
    const before = fake.calls.length;
    const next = createFakeKvman(); next.workspace.value = { ...next.workspace.value, id: 'draft-late-other' };
    const view = await mounted(QuestionCard, next, { questionId: 'draft-late', question: { kind: 'text', prompt: 'Name?' } });
    await view.find('[data-test="answer-text"]').setValue('new workspace');
    finish({ jobId: null }); await flushPromises();
    expect(view.find<HTMLInputElement>('[data-test="answer-text"]').element.value).toBe('new workspace');
    expect(fake.calls).toHaveLength(before); expect(fake.toast).not.toHaveBeenCalled(); view.unmount();
  });
});

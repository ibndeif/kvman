import { flushPromises } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ApprovalsCard from '../../web/src/ApprovalsCard.vue';
import QuestionCard from '../../web/src/QuestionCard.vue';
import { createFakeKvman } from './support/fake-kvman.ts';
import { mounted } from './support/fixtures.ts';

const answers = (fake: ReturnType<typeof createFakeKvman>) => fake.calls.filter((call) => call.name === 'kvcoder.question.answer').map((call) => call.input);

describe('question cards (08 §8.5, ADR 0009, 104)', () => {
  it('M2.4-E60 text, choice with other, and confirm questions are answered, and Skip dismisses', async () => {
    const fake = createFakeKvman();
    fake.handle('kvcoder.question.answer', () => ({ jobId: 'next' }));
    const text = await mounted(QuestionCard, fake, { questionId: 'q1', question: { kind: 'text', prompt: 'Name?' } });
    await text.find('[data-test="answer-text"]').setValue('Ada');
    await text.find('[data-test="answer"]').trigger('click');
    await text.find('[data-test="skip"]').trigger('click');
    await flushPromises();
    expect(text.emitted('answered')).toEqual([['next'], ['next']]);
    const choice = await mounted(QuestionCard, fake, { questionId: 'q2', question: { kind: 'choice', prompt: 'Which?', multiple: true, other: true, options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B', description: 'The second' }] } });
    expect(choice.find('[data-test="option-b"]').text()).toContain('The second');
    await choice.find('[data-test="option-a"] input').trigger('change');
    await choice.find('[data-test="option-b"] input').trigger('change');
    await choice.find('[data-test="answer-other"]').setValue('C too');
    await choice.find('[data-test="answer"]').trigger('click');
    const confirm = await mounted(QuestionCard, fake, { questionId: 'q3', question: { kind: 'confirm', prompt: 'Delete it?', danger: true } });
    await confirm.find('[data-test="answer-yes"]').trigger('click');
    await flushPromises();
    expect(answers(fake)).toEqual([
      { questionId: 'q1', answer: { text: 'Ada' } },
      { questionId: 'q1', answer: { dismissed: true } },
      { questionId: 'q2', answer: { selected: ['a', 'b'], other: 'C too' } },
      { questionId: 'q3', answer: { confirmed: true } },
    ]);
  });

  it("M2.4-E60 one reply's approvals share a card with Allow, Deny, and Allow all", async () => {
    const fake = createFakeKvman();
    let answered = 0;
    fake.handle('kvcoder.question.answer', () => ({ jobId: (answered += 1) === 3 ? 'step' : null }));
    const approvals = [
      { questionId: 'a1', command: 'npm ci', description: 'Reinstall.' },
      { questionId: 'a2', command: 'npm run build', description: 'Build.' },
      { questionId: 'a3', command: 'rm -rf dist', description: 'Clean.' },
    ];
    const card = await mounted(ApprovalsCard, fake, { approvals });
    expect(card.findAll('[data-test^="approval-"]').map((row) => row.text())).toEqual(['npm ciReinstall.DenyAllow', 'npm run buildBuild.DenyAllow', 'rm -rf distClean.DenyAllow']);
    await card.find('[data-test="approval-a1"] [data-test="deny"]').trigger('click');
    await flushPromises();
    await card.setProps({ approvals: approvals.slice(1) });
    await card.find('[data-test="allow-all"]').trigger('click');
    await flushPromises();
    expect(answers(fake)).toEqual([
      { questionId: 'a1', answer: { confirmed: false } },
      { questionId: 'a2', answer: { confirmed: true } },
      { questionId: 'a3', answer: { confirmed: true } },
    ]);
    expect(card.emitted('answered')).toEqual([[null], ['step']]);
  });
});

import { describe, expect, it } from 'vitest';
import ApprovalsCard from '../../web/src/ApprovalsCard.vue';
import PendingCards from '../../web/src/PendingCards.vue';
import QuestionCard from '../../web/src/QuestionCard.vue';
import ShellResult from '../../web/src/ShellResult.vue';
import { createFakeKvman } from './support/fake-kvman.ts';
import { mounted } from './support/fixtures.ts';

describe('question cards (08 §8.5, ADR 0009, 104, 141, 143)', () => {
  it('M2.4-E60 text, choice with other, and confirm questions say what was answered, and Skip dismisses', async () => {
    const fake = createFakeKvman();
    const text = await mounted(QuestionCard, fake, { questionId: 'q1', question: { kind: 'text', prompt: 'Name?' } });
    await text.find('[data-test="answer-text"]').setValue('Ada');
    await text.find('[data-test="answer"]').trigger('click');
    await text.find('[data-test="skip"]').trigger('click');
    expect(text.emitted('answer')).toEqual([[{ questionId: 'q1', answer: { text: 'Ada' } }], [{ questionId: 'q1', answer: { dismissed: true } }]]);
    const choice = await mounted(QuestionCard, fake, { questionId: 'q2', question: { kind: 'choice', prompt: 'Which?', multiple: true, other: true, options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B', description: 'The second' }] } });
    expect(choice.find('[data-test="option-b"]').text()).toContain('The second');
    expect(choice.find('[data-test="answer"]').attributes('disabled')).toBeDefined();
    await choice.find('[data-test="option-a"] input').trigger('change');
    await choice.find('[data-test="option-b"] input').trigger('change');
    await choice.find('[data-test="answer-other"]').setValue('C too');
    await choice.find('[data-test="answer"]').trigger('click');
    expect(choice.emitted('answer')).toEqual([[{ questionId: 'q2', answer: { selected: ['a', 'b'], other: 'C too' } }]]);
    const confirm = await mounted(QuestionCard, fake, { questionId: 'q3', question: { kind: 'confirm', prompt: 'Delete it?', danger: true } });
    await confirm.find('[data-test="answer-yes"]').trigger('click');
    expect(confirm.emitted('answer')).toEqual([[{ questionId: 'q3', answer: { confirmed: true } }]]);
    expect(fake.calls).toEqual([]);
  });

  it("M2.4-E60 one reply's approvals share a card with Allow, Deny, and Allow all, each saying what was decided", async () => {
    const approvals = [
      { questionId: 'a1', title: '', command: 'npm ci', description: 'Reinstall.' },
      { questionId: 'a2', title: '', command: 'npm run build', description: 'Build.' },
      { questionId: 'a3', title: '', command: 'rm -rf dist', description: 'Clean.' },
    ];
    const card = await mounted(ApprovalsCard, createFakeKvman(), { approvals });
    expect(card.findAll('[data-test^="approval-"]').map((row) => row.text())).toEqual(['Reinstall.npm ciDenyAllow', 'Build.npm run buildDenyAllow', 'Clean.rm -rf distDenyAllow']);
    await card.find('[data-test="approval-a1"] [data-test="deny"]').trigger('click');
    await card.find('[data-test="approval-a2"] [data-test="allow"]').trigger('click');
    await card.find('[data-test="allow-all"]').trigger('click');
    expect(card.emitted('decide')).toEqual([[{ approvals: [approvals[0]], confirmed: false }], [{ approvals: [approvals[1]], confirmed: true }], [{ approvals, confirmed: true }]]);
  });

  it('QA3-H5 an approval shows the call\'s title, description, and command', async () => {
    const approvals = [{ questionId: 'a1', title: 'Install the packages', command: 'npm ci', description: 'Installs what package.json lists.' }];
    const card = await mounted(ApprovalsCard, createFakeKvman(), { approvals });
    const row = card.find('[data-test="approval-a1"]');
    expect(row.find('[data-test="call-title"]').text()).toBe('Install the packages');
    expect(row.find('[data-test="call-description"]').text()).toBe('Installs what package.json lists.');
    expect(row.find('[data-test="call-command"]').text()).toBe('npm ci');
  });

  it('QA3-H19 an async approval says it runs in the background, and a sync one does not', async () => {
    const pending = (mode: string) => [{ toolCallId: 'c1', kind: 'approval' as const, questionId: `a-${mode}`, question: { title: 'Start the server', command: 'python3 -m http.server 8000', description: 'Serves the app.', mode, timeoutMs: 120_000 }, childSessionId: null }];
    const asyncCard = await mounted(PendingCards, createFakeKvman(), { pending: pending('async') });
    expect(asyncCard.find('[data-test="call-background"]').text()).toBe('Runs in the background');
    const syncCard = await mounted(PendingCards, createFakeKvman(), { pending: pending('sync') });
    expect(syncCard.find('[data-test="call-background"]').exists()).toBe(false);
  });

  it("QA3-H19 the result card of an async call is marked 'Background'", async () => {
    const card = await mounted(ShellResult, createFakeKvman(), { command: 'npm run dev', output: 'started j1', exitCode: 0, background: true });
    expect(card.find('[data-test="call-background"]').text()).toBe('Background');
  });
});

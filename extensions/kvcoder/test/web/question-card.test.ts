import { describe, expect, it } from 'vitest';
import ApprovalsCard from '../../web/src/ApprovalsCard.vue';
import PendingCards from '../../web/src/PendingCards.vue';
import QuestionCard from '../../web/src/QuestionCard.vue';
import CallCard from '../../web/src/CallCard.vue';
import { callView } from '../../web/src/call-view.ts';
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
      { questionId: 'a1', view: callView({ description: 'Reinstall.', connector: 'shell', command: 'exec', payload: { line: 'npm ci' } }) },
      { questionId: 'a2', view: callView({ description: 'Build.', connector: 'shell', command: 'exec', payload: { line: 'npm run build' } }) },
      { questionId: 'a3', view: callView({ description: 'Clean.', connector: 'shell', command: 'exec', payload: { line: 'rm -rf dist' } }) },
    ];
    const card = await mounted(ApprovalsCard, createFakeKvman(), { approvals });
    expect(card.findAll('[data-test^="approval-"]').map((row) => row.text())).toEqual(['Reinstall.$ npm ciDenyAllow', 'Build.$ npm run buildDenyAllow', 'Clean.$ rm -rf distDenyAllow']);
    await card.find('[data-test="approval-a1"] [data-test="deny"]').trigger('click');
    await card.find('[data-test="approval-a2"] [data-test="allow"]').trigger('click');
    await card.find('[data-test="allow-all"]').trigger('click');
    expect(card.emitted('decide')).toEqual([[{ approvals: [approvals[0]], confirmed: false }], [{ approvals: [approvals[1]], confirmed: true }], [{ approvals, confirmed: true }]]);
  });

  it('QA18-H21 and QA3-H5 an approval shows the description, and the line it would run or the file it would change (ADR 0036, 12)', async () => {
    const approval = (questionId: string, question: Record<string, unknown>) => ({ toolCallId: questionId, kind: 'approval' as const, questionId, question, childSessionId: null });
    const pending = [
      approval('a1', { description: 'Installing the packages.', connector: 'shell', command: 'exec', payload: { line: 'npm ci', risky: true } }),
      approval('a2', { description: 'Writing the page.', connector: 'fs', command: 'write', payload: { path: 'index.html', content: '<p>hi</p>' } }),
      approval('a3', { description: 'Checking what changed.', connector: 'git', command: 'exec', payload: { args: 'status --short' } }),
    ];
    const cards = await mounted(PendingCards, createFakeKvman(), { pending });
    const row = (id: string, part: string): string => cards.find(`[data-test="approval-${id}"] [data-test="call-${part}"]`).text();
    expect([row('a1', 'description'), row('a1', 'subject')]).toEqual(['Installing the packages.', '$ npm ci']);
    expect([row('a2', 'description'), row('a2', 'words'), row('a2', 'subject')]).toEqual(['Writing the page.', 'Write', 'index.html']);
    expect(row('a3', 'subject')).toBe('$ git status --short');
    expect(cards.find('[data-test="call-label"]').exists()).toBe(false);
  });

  it('QA11-H5 an approval stored before the run tool shows its command, with no empty description line', async () => {
    const pending = await mounted(PendingCards, createFakeKvman(), { pending: [{ toolCallId: 'c1', kind: 'approval', questionId: 'a2', question: { command: 'ls -la', mode: 'sync', timeoutMs: 120000 }, childSessionId: null }] });
    expect(pending.find('[data-test="approval-a2"] [data-test="call-subject"]').text()).toBe('ls -la');
    expect(pending.find('[data-test="approval-a2"] [data-test="call-description"]').exists()).toBe(false);
    expect(pending.find('[data-test="approval-a2"] [data-test="call-label"]').exists()).toBe(false);
  });

  it('QA3-H19 a background approval says it runs in the background, and another does not', async () => {
    const pending = (background: boolean) => [{ toolCallId: 'c1', kind: 'approval' as const, questionId: 'a1', question: { description: 'Serves the app.', connector: 'shell', command: 'exec', payload: { line: 'python3 -m http.server 8000', ...(background ? { background } : {}) } }, childSessionId: null }];
    const inBackground = await mounted(PendingCards, createFakeKvman(), { pending: pending(true) });
    expect(inBackground.find('[data-test="call-background"]').text()).toBe('Runs in the background');
    const waited = await mounted(PendingCards, createFakeKvman(), { pending: pending(false) });
    expect(waited.find('[data-test="call-background"]').exists()).toBe(false);
  });

  it("QA3-H19 the result card of a background call is marked 'Background'", async () => {
    const card = await mounted(CallCard, createFakeKvman(), { view: { description: 'Starting the dev server.', line: 'npm run dev', background: true }, output: 'started j1' });
    expect(card.find('[data-test="call-background"]').text()).toBe('Background');
  });
});

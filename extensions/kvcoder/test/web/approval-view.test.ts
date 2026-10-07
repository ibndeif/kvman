import { describe, expect, it } from 'vitest';
import PendingCards from '../../web/src/PendingCards.vue';
import { createFakeKvman } from './support/fake-kvman.ts';
import { mounted } from './support/fixtures.ts';

const approval = (questionId: string, question: Record<string, unknown>) => ({ toolCallId: questionId, kind: 'approval' as const, questionId, question, childSessionId: null });

describe('the approval card shows what the person allows (08 §8.7, ADR 0036, 12)', () => {
  it('QA48-H13 each approval shows its description, its closed line, and its payload by its kind, and still answers', async () => {
    const longLine = `node build.js ${'--flag '.repeat(40)}`.trim();
    const pending = [
      approval('a1', { description: 'Fixing the title.', connector: 'fs', command: 'edit', payload: { path: 'index.html', edits: [{ oldText: '<h1>Old</h1>', newText: '<h1>New</h1>' }], risky: true } }),
      approval('a2', { description: 'Writing the notes.', connector: 'fs', command: 'write', payload: { path: 'notes.md', content: '# Notes\nMilk\n', risky: true } }),
      approval('a3', { description: 'Building.', connector: 'shell', command: 'exec', payload: { line: longLine, risky: true } }),
      approval('a4', { description: 'Closing the issue.', connector: 'mcp', command: 'call', payload: { server: 'github', tool: 'close_issue', arguments: { number: 7 }, risky: true } }),
    ];
    const cards = await mounted(PendingCards, createFakeKvman(), { pending });
    const row = (id: string) => cards.find(`[data-test="approval-${id}"]`);
    const line = (id: string): string => ['call-words', 'call-subject'].flatMap((name) => (row(id).find(`[data-test="${name}"]`).exists() ? [row(id).find(`[data-test="${name}"]`).text()] : [])).join(' ');
    expect(['a1', 'a2', 'a3', 'a4'].map((id) => row(id).find('[data-test="call-description"]').text())).toEqual(['Fixing the title.', 'Writing the notes.', 'Building.', 'Closing the issue.']);
    expect(['a1', 'a2', 'a3', 'a4'].map(line)).toEqual(['Edit index.html', 'Write notes.md', `$ ${longLine}`, 'github · close_issue']);
    expect(cards.find('[data-test="call-label"]').exists()).toBe(false);
    expect(row('a1').findAll('[data-test="call-diff"] [data-test="call-line-row"]').map((found) => found.text())).toEqual(['−<h1>Old</h1>', '+<h1>New</h1>']);
    expect(row('a2').findAll('[data-test="call-content"] [data-test="call-line-row"]').map((found) => found.text())).toEqual(['1# Notes', '2Milk']);
    expect(row('a3').find('[data-test="call-payload"]').exists()).toBe(false);
    expect(row('a4').findAll('[data-test="call-payload-fields"] [data-test="field-row"]').map((found) => found.text())).toEqual(['number7']);
    await row('a1').find('[data-test="allow"]').trigger('click');
    await row('a2').find('[data-test="deny"]').trigger('click');
    const decided = (cards.emitted('decide') ?? []).map(([decision]) => decision as { approvals: { questionId: string }[]; confirmed: boolean });
    expect(decided.map((decision) => [decision.approvals.map((item) => item.questionId), decision.confirmed])).toEqual([[['a1'], true], [['a2'], false]]);
  });
});

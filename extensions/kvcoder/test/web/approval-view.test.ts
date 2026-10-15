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

  it('QA48-H18 an mcp run approval shows its numbered steps with their arguments, without server, risky, or timeoutMs', async () => {
    const steps = [{ tool: 'browser_navigate', arguments: { url: 'http://127.0.0.1:33473/research' } }, { tool: 'browser_wait_for', arguments: { time: 60 } }, { tool: 'browser_console_messages' }];
    const pending = [approval('a1', { description: 'Trying the page.', connector: 'mcp', command: 'run', payload: { server: 'playwright', steps, timeoutMs: 30000, risky: true } })];
    const cards = await mounted(PendingCards, createFakeKvman(), { pending });
    const row = cards.find('[data-test="approval-a1"]');
    expect(row.find('[data-test="call-subject"]').text()).toBe('playwright · browser_navigate, browser_wait_for, browser_console_messages');
    expect(row.findAll('[data-test="call-step-tool"]').map((tool) => tool.text())).toEqual(['1. browser_navigate', '2. browser_wait_for', '3. browser_console_messages']);
    expect(row.findAll('[data-test="call-step"]').map((step) => step.findAll('[data-test="field-row"]').map((found) => found.text()))).toEqual([['urlhttp://127.0.0.1:33473/research'], ['time60'], []]);
    const request = row.find('[data-test="call-steps"]').text();
    for (const hidden of ['server', 'steps', 'arguments', 'risky', 'timeoutMs']) expect(request, hidden).not.toContain(hidden);
  });

  it('M2.4-E210 Deny and Allow are a row of their own under the call, and the card keeps its last row', async () => {
    const longLine = `pnpm exec vitest run ${'extensions/kvcoder/test/step-intent-recovery.test.ts '.repeat(8)}`.trim();
    const pending = [approval('a1', { description: 'Verifying recovery.', connector: 'shell', command: 'exec', payload: { line: longLine, risky: false } }), approval('a2', { description: 'Writing the notes.', connector: 'fs', command: 'write', payload: { path: 'notes.md', content: 'Milk\n', risky: true } })];
    const cards = await mounted(PendingCards, createFakeKvman(), { pending });
    for (const id of ['a1', 'a2']) {
      const parts = cards.find(`[data-test="approval-${id}"]`).element.children;
      const actions = parts[parts.length - 1];
      expect(actions?.getAttribute('data-test'), id).toBe('decision-actions');
      expect([...(actions?.children ?? [])].map((button) => button.getAttribute('data-test')), id).toEqual(['deny', 'allow']);
      expect(actions?.querySelector('[data-test="call-subject"]'), id).toBeNull();
    }
    expect(cards.find('[data-test="approval-a1"] [data-test="call-subject"]').text()).toBe(`$ ${longLine}`);
    const last = cards.find('[data-test="approvals-card"]').element.lastElementChild;
    expect([...(last?.children ?? [])].map((button) => button.getAttribute('data-test'))).toEqual(['deny-all', 'allow-all']);
  });
});

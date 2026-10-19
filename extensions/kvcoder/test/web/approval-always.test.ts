import { describe, expect, it } from 'vitest';
import PendingCards from '../../web/src/PendingCards.vue';
import { createFakeKvman } from './support/fake-kvman.ts';
import { mounted } from './support/fixtures.ts';

const approval = (questionId: string, question: Record<string, unknown>) => ({ toolCallId: questionId, kind: 'approval' as const, questionId, question, childSessionId: null });
type Decided = { approvals: { questionId: string }[]; confirmed: boolean; remember?: unknown; reason?: string };

async function card(question: Record<string, unknown>) {
  const cards = await mounted(PendingCards, createFakeKvman(), { pending: [approval('a1', question)] });
  const row = cards.find('[data-test="approval-a1"]');
  const decided = (): Decided[] => (cards.emitted('decide') ?? []).map(([decision]) => decision as Decided);
  return { row, decided };
}

describe('Always allow and Deny and say why on the approval card (08 §8.7, ADR 0091, 3 and 4)', () => {
  it('QA59-H6 a line offers its first two words to always allow, and sends the prefix the person kept or typed', async () => {
    const { row, decided } = await card({ connector: 'shell', command: 'exec', payload: { line: 'pnpm exec vitest run', risky: true } });
    expect((row.find('[data-test="always-prefix"]').element as HTMLInputElement).value).toBe('pnpm exec');
    await row.find('[data-test="always-allow"]').trigger('click');
    await row.find('[data-test="always-prefix"]').setValue('pnpm');
    await row.find('[data-test="always-allow"]').trigger('click');
    expect(decided().map((decision) => [decision.confirmed, decision.remember])).toEqual([[true, { kind: 'line', prefix: 'pnpm exec' }], [true, { kind: 'line', prefix: 'pnpm' }]]);
  });

  it('QA59-H6 a file change offers to always allow file changes, and an mcp call offers nothing', async () => {
    const edit = await card({ connector: 'fs', command: 'edit', payload: { path: 'a.ts', edits: [{ oldText: 'a', newText: 'b' }], risky: true } });
    expect(edit.row.find('[data-test="always-allow"]').text()).toBe('Always allow file changes here');
    await edit.row.find('[data-test="always-allow"]').trigger('click');
    expect(edit.decided()[0]?.remember).toEqual({ kind: 'files' });
    const mcp = await card({ connector: 'mcp', command: 'call', payload: { server: 's', tool: 't', risky: true } });
    expect(mcp.row.find('[data-test="always-allow"]').exists()).toBe(false);
  });

  it('QA59-H6 Deny still denies at once, and Deny and say why sends the reason, or none when it is empty', async () => {
    const { row, decided } = await card({ connector: 'shell', command: 'exec', payload: { line: 'rm -rf build', risky: true } });
    await row.find('[data-test="deny"]').trigger('click');
    await row.find('[data-test="deny-why"]').trigger('click');
    await row.find('[data-test="deny-reason-send"]').trigger('click');
    await row.find('[data-test="deny-reason-text"]').setValue('  use pnpm clean  ');
    await row.find('[data-test="deny-reason-send"]').trigger('click');
    expect(decided().map((decision) => [decision.confirmed, decision.reason])).toEqual([[false, undefined], [false, undefined], [false, 'use pnpm clean']]);
  });
});

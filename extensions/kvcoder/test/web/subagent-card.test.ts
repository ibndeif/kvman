import { afterEach, describe, expect, it, vi } from 'vitest';
import SubagentCard from '../../web/src/SubagentCard.vue';
import { idleLive } from '../../web/src/live-step.ts';
import type { Child } from '../../web/src/use-conversation.ts';
import { createFakeKvman } from './support/fake-kvman.ts';
import { mounted, session, turn } from './support/fixtures.ts';

// A worker's card says where it is while it runs: its newest headline, its step against its budget, its time so far,
// and its last call's closed line (plan 08 §8.7, ADR 0108, 17).

const startedAt = '2026-10-30T09:00:00.000Z';

function helper(status: 'running' | 'idle', steps: number): Child {
  return {
    session: session({ id: 'h1', status, worker: 'general', run: { kind: 'find', goal: 'Find the importer', budget: 60 } }),
    turn: turn({ id: 'ht1', sessionId: 'h1', startedAt, steps }),
    live: { ...idleLive(), thinking: '**Opening the folder**\n\nFirst.\n\n**Reading the importer**\n\nThen.', calls: [{ name: 'run', label: 'fs read src/a.ts', complete: true }] },
  };
}

afterEach(() => { vi.useRealTimers(); });

describe("a worker's card (ADR 0108, 17)", () => {
  it('QA71-H30 a running helper shows its newest headline, its step of its budget, its time, and its last call', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(Date.parse(startedAt) + 3 * 60_000);
    const card = await mounted(SubagentCard, createFakeKvman(), { child: helper('running', 12), task: 'Find the importer' });
    expect(card.find('[data-test="subagent-headline"]').text()).toBe('Reading the importer');
    expect(card.find('[data-test="subagent-step"]').text()).toBe('step 12 of 60');
    expect(card.find('[data-test="subagent-elapsed"]').text()).toMatch(/^3 min/);
    expect(card.find('[data-test="subagent-call"]').text()).toBe('fs read src/a.ts');
    expect(card.find('[data-test="subagent-task"]').text()).toBe('Find the importer');
    card.unmount();
  });

  it('QA71-E37 a helper at the last step of its budget shows it, and once it ended its card shows no progress', async () => {
    const last = await mounted(SubagentCard, createFakeKvman(), { child: helper('running', 60) });
    expect(last.find('[data-test="subagent-step"]').text()).toBe('step 60 of 60');
    last.unmount();
    const ended = await mounted(SubagentCard, createFakeKvman(), { child: helper('idle', 60) });
    expect(ended.find('[data-test="subagent-progress"]').exists()).toBe(false);
    ended.unmount();
  });
});

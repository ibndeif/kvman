import { describe, expect, it } from 'vitest';
import ConversationView from '../../web/src/ConversationView.vue';
import { backgroundText } from '../../src/turns/background.ts';
import { createFakeKvman } from './support/fake-kvman.ts';
import { job, mounted, serve, session, turn, user } from './support/fixtures.ts';

const jobResult = (id: string, call: string) => user(backgroundText(call, id, 'done'), { source: { kind: 'job', jobId: id } });
const helperResult = (id: string, call: string) => user(backgroundText(call, id, 'done'), { source: { kind: 'subagent', sessionId: id } });

async function times(messages: ReturnType<typeof user>[], jobs: ReturnType<typeof job>[]): Promise<(string | null)[]> {
  const fake = createFakeKvman();
  serve(fake, { found: session(), messages, omitted: 0, turns: [turn()], jobs });
  const wrapper = await mounted(ConversationView, fake, { sessionId: 's1' });
  const shown = wrapper.findAll('[data-test="background-result"]').map((card) => (card.find('[data-test="background-time"]').exists() ? card.find('[data-test="background-time"]').text() : null));
  wrapper.unmount();
  return shown;
}

describe("a finished background job's card shows how long it ran (08 §8.7, ADR 0036, 14)", () => {
  it("QA48-H14 a job's and a helper's card end with the time between the run's start and its end", async () => {
    const jobs = [
      job({ id: 'j1', status: 'exited', startedAt: '2026-10-01T09:00:00.000Z', endedAt: '2026-10-01T09:01:09.000Z' }),
      job({ id: 's2', kind: 'subagent', title: 'Plan reviewer', status: 'done', startedAt: '2026-10-01T09:00:00.000Z', endedAt: '2026-10-01T09:00:36.000Z' }),
    ];
    expect(await times([jobResult('j1', 'node test.js'), helperResult('s2', 'Review the plan')], jobs)).toEqual(['1 min 9 s', '36 s']);
  });

  it("QA48-E17 a card whose run isn't in the list, or hasn't ended, has no time", async () => {
    const jobs = [job({ id: 'j2', status: 'running', startedAt: '2026-10-01T09:00:00.000Z' })];
    expect(await times([jobResult('j1', 'node test.js'), jobResult('j2', 'npm run dev')], jobs)).toEqual([null, null]);
  });

  it("QA49-H3 a finished helper's card has the title its run was given", async () => {
    const fake = createFakeKvman();
    const jobs = [job({ id: 's2', kind: 'subagent', title: 'Plan reviewer', status: 'succeeded', startedAt: '2026-10-01T09:00:00.000Z', endedAt: '2026-10-01T09:00:36.000Z' })];
    serve(fake, { found: session(), messages: [helperResult('s2', 'Review the plan')], omitted: 0, turns: [turn()], jobs });
    const wrapper = await mounted(ConversationView, fake, { sessionId: 's1' });
    expect(wrapper.find('[data-test="background-title"]').text()).toBe('A helper finished: Plan reviewer');
    wrapper.unmount();
  });

  it("QA49-E2 a helper whose run isn't in the list keeps the call's words", async () => {
    const fake = createFakeKvman();
    serve(fake, { found: session(), messages: [helperResult('s9', 'Review the plan')], omitted: 0, turns: [turn()], jobs: [] });
    const wrapper = await mounted(ConversationView, fake, { sessionId: 's1' });
    expect(wrapper.find('[data-test="background-title"]').text()).toBe('A helper finished: Review the plan');
    wrapper.unmount();
  });
});

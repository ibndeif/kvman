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
  it("QA48-H14 a job's and a helper's line end with the time between the run's start and its end", async () => {
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

  // The line shows the name alone since QA73-E7 (ADR 0112, 5).
  it("QA49-H3 and QA73-E7 a finished helper's line has the title its run was given", async () => {
    const fake = createFakeKvman();
    const jobs = [job({ id: 's2', kind: 'subagent', title: 'Plan reviewer', status: 'succeeded', startedAt: '2026-10-01T09:00:00.000Z', endedAt: '2026-10-01T09:00:36.000Z' })];
    serve(fake, { found: session(), messages: [helperResult('s2', 'Review the plan')], omitted: 0, turns: [turn()], jobs });
    const wrapper = await mounted(ConversationView, fake, { sessionId: 's1' });
    expect(wrapper.find('[data-test="background-title"]').text()).toBe('Plan reviewer');
    wrapper.unmount();
  });

  it("QA49-E2 a helper whose run isn't in the list keeps the call's words", async () => {
    const fake = createFakeKvman();
    serve(fake, { found: session(), messages: [helperResult('s9', 'Review the plan')], omitted: 0, turns: [turn()], jobs: [] });
    const wrapper = await mounted(ConversationView, fake, { sessionId: 's1' });
    expect(wrapper.find('[data-test="background-title"]').text()).toBe('Review the plan');
    wrapper.unmount();
  });
});

const ended = (status: string, ranSeconds: number, id = 'j1') => job({ id, status, startedAt: '2026-10-01T09:00:00.000Z', endedAt: new Date(Date.parse('2026-10-01T09:00:00.000Z') + ranSeconds * 1000).toISOString() });

async function line(messages: ReturnType<typeof user>[], jobs: ReturnType<typeof job>[], language: 'en' | 'ar' = 'en') {
  const fake = createFakeKvman();
  fake.language.value = language;
  serve(fake, { found: session(), messages, omitted: 0, turns: [turn()], jobs });
  return mounted(ConversationView, fake, { sessionId: 's1' });
}
const part = (view: Awaited<ReturnType<typeof line>>, name: string): string | undefined => {
  const found = view.find(`[data-test="${name}"]`);
  return found.exists() ? found.text() : undefined;
};

describe('a background ending is one quiet line (08 §8.7, ADR 0112, 5)', () => {
  it('QA73-H8 a job that succeeded is a check mark, its words, and its time, not a card, and opens to what the model read', async () => {
    const view = await line([jobResult('j1', 'npm run web:build')], [ended('succeeded', 41)]);
    const shown = view.find('[data-test="background-result"]');
    expect(shown.element.tagName).toBe('DETAILS');
    expect(shown.classes()).not.toContain('kvc-card');
    expect(shown.find('[data-test="background-mark"]').attributes('aria-label')).toBe('Done');
    expect(shown.find('[data-test="background-mark"]').attributes('data-status')).toBe('succeeded');
    expect([part(view, 'background-title'), part(view, 'background-time')]).toEqual(['npm run web:build', '41 s']);
    expect(shown.find('pre').text()).toBe(backgroundText('npm run web:build', 'j1', 'done'));
  });

  it('QA73-H9 a job that failed is a cross named Failed', async () => {
    const view = await line([jobResult('j1', 'npm test')], [ended('failed', 120)]);
    expect(view.find('[data-test="background-mark"]').attributes('aria-label')).toBe('Failed');
    expect(view.find('[data-test="background-mark"]').attributes('data-status')).toBe('failed');
  });

  it("QA73-H10 the runs that ended while kvman was stopped are one line, in the page's language", async () => {
    const report = user('While kvman was stopped, these background calls ended:\n- `npm run dev` (job j1): interrupted because kvman stopped.\n- `node serve.js` (job j2): interrupted because kvman stopped.', { source: { kind: 'job', jobId: 'j1' } });
    const english = await line([report], [ended('interrupted', 30)]);
    expect([part(english, 'background-title'), part(english, 'background-time')]).toEqual(['2 runs ended while kvman was stopped', undefined]);
    expect(english.find('[data-test="background-mark"]').attributes('data-status')).toBe('ended');
    const arabic = await line([report], [], 'ar');
    expect(part(arabic, 'background-title')).toBe('انتهت مهمتان خلفيتان أثناء توقف kvman');
  });

  it("QA73-E6 a run the list doesn't hold is a plain circle with the call's words and no time", async () => {
    const view = await line([jobResult('j7', 'node old.js')], []);
    expect(view.find('[data-test="background-mark"]').attributes('aria-label')).toBe('Ended');
    expect([part(view, 'background-title'), part(view, 'background-time')]).toEqual(['node old.js', undefined]);
  });
});

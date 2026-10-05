import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ConversationView from '../../web/src/ConversationView.vue';
import { createFakeKvman } from './support/fake-kvman.ts';
import { job, mounted, serve, session, turn, user } from './support/fixtures.ts';

const started = Date.parse('2026-10-01T09:00:00.000Z');

afterEach(() => vi.useRealTimers());

describe("the card of a program worker's run (08 §8.7, ADR 0021, 14)", () => {
  it('QA32-H15 a turn waiting on a run shows the worker, what the call does, how long it has run, and Stop', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'], now: started + 134_000 });
    const fake = createFakeKvman();
    const pending = [{ toolCallId: 'c1', kind: 'worker' as const, questionId: null, question: null, childSessionId: null, runId: 'r1' }];
    const run = job({ id: 'r1', kind: 'worker', title: 'opencode', call: 'Writing the retry test.', startedAt: new Date(started).toISOString() });
    serve(fake, { found: session({ status: 'waiting' }), messages: [user('go')], omitted: 0, turns: [turn({ pending })], jobs: [run] });
    fake.handle('kvcoder.job.get', () => run);
    fake.handle('kvcoder.job.cancel', () => ({}));
    const wrapper = await mounted(ConversationView, fake, { sessionId: 's1' });
    await flushPromises();
    const card = wrapper.find('[data-test="worker-card"]');
    expect(card.find('[data-test="worker-card-name"]').text()).toBe('opencode');
    expect(card.find('[data-test="worker-card-call"]').text()).toBe('Writing the retry test.');
    expect(card.find('[data-test="worker-card-time"]').text()).toBe('Running · 2 min 14 s');
    expect(wrapper.text()).not.toContain('Sending a message skips');
    await card.find('[data-test="worker-card-stop"]').trigger('click');
    await flushPromises();
    expect(fake.calls.filter((call) => call.name === 'kvcoder.job.cancel').map((call) => call.input)).toEqual([{ sessionId: 's1', id: 'r1' }]);
    wrapper.unmount();
  });
});

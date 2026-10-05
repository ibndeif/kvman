import { describe, expect, it } from 'vitest';
import MessageItem from '../../web/src/MessageItem.vue';
import { durationText } from '../../web/src/durations.ts';
import { callViews } from '../../web/src/message-parts.ts';
import { createFakeKvman } from './support/fake-kvman.ts';
import { message, mounted } from './support/fixtures.ts';

type Wrapper = Awaited<ReturnType<typeof mounted>>;

// A step as kvcoder stores it: the answer that made the calls, with how long the model took, and each call's result.
function step(writtenMs: number | undefined, runs: { ms: number; failed?: boolean }[]) {
  const answer = message('assistant', { role: 'assistant', content: runs.map((_run, index) => ({ type: 'toolCall', id: `c${index}`, name: 'run', arguments: { description: `Call ${index}`, connector: 'fs', command: 'write', payload: { path: 'a.txt' } } })) }, writtenMs === undefined ? {} : { durationMs: writtenMs });
  const results = runs.map((run, index) => message('toolResult', { role: 'toolResult', toolCallId: `c${index}`, toolName: 'run', content: [{ type: 'text', text: 'done' }], isError: run.failed === true, details: { description: `Call ${index}`, connector: 'fs', command: 'write', output: 'done', durationMs: run.ms } }));
  const calls = callViews([answer, ...results]);
  return Promise.all(results.map((result) => mounted(MessageItem, createFakeKvman(), { message: result, calls })));
}

const time = (card: Wrapper) => card.find('[data-test="call-time"]').text();

async function parts(card: Wrapper): Promise<string> {
  await card.find('[data-test="call-card"] button').trigger('click');
  return card.find('[data-test="call-parts"]').text();
}

describe("a finished call's time (08 §8.7, ADR 0017, 1, 2, and 7)", () => {
  it('QA24-H1 a finished call shows the whole wait, and opened, the two parts', async () => {
    const [card] = await step(36_000, [{ ms: 2 }]);
    if (card === undefined) throw new Error('No card.');
    expect(time(card)).toBe('36 s');
    expect(await parts(card)).toBe('Written in 36 s · ran in 2 ms');
  });

  it('QA24-H2 times use the unit that fits', () => {
    const t = createFakeKvman().kvman.t;
    expect([2, 999, 1240, 9949, 36_002, 59_400, 59_600, 69_319, 120_000].map((ms) => durationText(t, ms))).toEqual(['2 ms', '999 ms', '1.2 s', '9.9 s', '36 s', '59 s', '1 min 0 s', '1 min 9 s', '2 min 0 s']);
  });

  it('QA24-H3 a failed call says Failed, with its danger border, and a call that worked has neither', async () => {
    const [failed, worked] = await step(1000, [{ ms: 1, failed: true }, { ms: 1 }]);
    expect(failed?.find('[data-test="call-failed"]').text()).toBe('Failed');
    expect(failed?.find('[data-test="call-card"]').classes()).toContain('kvc-failed');
    expect(worked?.find('[data-test="call-failed"]').exists()).toBe(false);
    expect(worked?.find('[data-test="call-card"]').classes()).not.toContain('kvc-failed');
  });

  it('QA24-E1 a call whose answer has no time shows its run alone', async () => {
    const [card] = await step(undefined, [{ ms: 2 }]);
    if (card === undefined) throw new Error('No card.');
    expect(time(card)).toBe('2 ms');
    expect(await parts(card)).toBe('Ran in 2 ms');
  });

  it("QA24-E2 several calls of one step each show the step's model time plus their own run", async () => {
    const cards = await step(5000, [{ ms: 1000 }, { ms: 3000 }]);
    expect(cards.map(time)).toEqual(['6.0 s', '8.0 s']);
  });
});

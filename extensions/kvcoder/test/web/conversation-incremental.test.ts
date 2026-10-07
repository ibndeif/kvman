import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ConversationView from '../../web/src/ConversationView.vue';
import { createFakeKvman, type FakeKvman } from './support/fake-kvman.ts';
import { answer, mounted, serve, session, turn, user } from './support/fixtures.ts';

afterEach(() => {
  vi.useRealTimers();
});

const pollMs = 5000;

// The conversation's own query, answered as kvcoder answers it: with `afterSeq`, only the newer messages.
function world(fake: FakeKvman, messages: ReturnType<typeof user>[]) {
  serve(fake, { found: session(), messages, omitted: 0, turns: [turn()] });
  fake.handle('kvcoder.message.list', (input) => ({ messages: messages.filter((message) => typeof input['afterSeq'] !== 'number' || (message.seq ?? 0) > input['afterSeq']), omitted: 0 }));
}

const lists = (fake: FakeKvman) => fake.calls.filter((call) => call.name === 'kvcoder.message.list').map((call) => call.input['afterSeq']);
const texts = (wrapper: Awaited<ReturnType<typeof mounted>>) => wrapper.findAll('[data-test="markdown"]').map((node) => node.text());

async function nextPoll(): Promise<void> {
  await vi.advanceTimersByTimeAsync(pollMs);
  await flushPromises();
}

describe('the conversation fetches only what is new (08 §8.7, ADR 0034, 8)', () => {
  it('QA46-H8 after the first load the page asks for the messages after its last one and adds them once', async () => {
    vi.useFakeTimers();
    const fake = createFakeKvman();
    const messages = [user('go'), answer('first answer')];
    world(fake, messages);
    const wrapper = await mounted(ConversationView, fake, { sessionId: 's1' });
    expect(lists(fake)).toEqual([undefined]);
    messages.push(user('more'), answer('second answer'));
    await nextPoll();
    expect(lists(fake)).toEqual([undefined, messages[1]?.seq]);
    expect(texts(wrapper)).toEqual(['first answer', 'second answer']);
    await nextPoll();
    expect(lists(fake).at(-1)).toBe(messages[3]?.seq);
    expect(texts(wrapper)).toEqual(['first answer', 'second answer']);
  });

  it("QA46-E5 when the newer messages don't start at the next one, the whole list is loaded again", async () => {
    vi.useFakeTimers();
    const fake = createFakeKvman();
    const messages = [user('go'), answer('first answer')];
    world(fake, messages);
    const wrapper = await mounted(ConversationView, fake, { sessionId: 's1' });
    const skipped = answer('skipped answer');
    const late = answer('late answer');
    messages.push(skipped, late);
    fake.handle('kvcoder.message.list', (input) => ({ messages: typeof input['afterSeq'] === 'number' ? [late] : messages, omitted: 0 }));
    await nextPoll();
    expect(lists(fake)).toEqual([undefined, messages[1]?.seq, undefined]);
    expect(texts(wrapper)).toEqual(['first answer', 'skipped answer', 'late answer']);
  });
});

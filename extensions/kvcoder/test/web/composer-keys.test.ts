import { flushPromises } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ConversationView from '../../web/src/ConversationView.vue';
import { createFakeKvman, type FakeKvman } from './support/fake-kvman.ts';
import { answer, mounted, serve, session, turn, user as stored, type World } from './support/fixtures.ts';

// A message the person typed, as kvcoder stores it.
const user = (text: string) => stored(text, { source: { kind: 'user' } });

type Wrapper = Awaited<ReturnType<typeof mounted>>;

const box = (view: Wrapper) => view.find<HTMLTextAreaElement>('[data-test="composer-text"]');
const cancels = (fake: FakeKvman) => fake.calls.filter((call) => call.name === 'kvcoder.turn.cancel');

async function chat(status: 'running' | 'idle', messages: World['messages']): Promise<{ fake: FakeKvman; view: Wrapper }> {
  const fake = createFakeKvman();
  fake.handle('kvcoder.turn.cancel', () => ({}));
  const done = status === 'idle' ? { outcome: 'done' as const, endedAt: '2026-10-01T09:01:00.000Z' } : {};
  serve(fake, { found: session({ status }), messages, omitted: 0, turns: [turn(done)] });
  return { fake, view: await mounted(ConversationView, fake, { sessionId: 's1' }) };
}

async function press(view: Wrapper, key: string): Promise<void> {
  await box(view).trigger('keydown', { key });
  await flushPromises();
}

describe('Esc and Up in the send box (08 §8.7, ADR 0090, 6)', () => {
  it('QA58-H11 Esc in the empty box stops the running turn once', async () => {
    const { fake, view } = await chat('running', [user('go')]);
    await press(view, 'Escape');
    expect(cancels(fake)).toHaveLength(1);
    view.unmount();
  });

  it('QA58-H12 Up in the empty box brings back the last message the person typed, without its files line', async () => {
    const { view } = await chat('idle', [user('first'), answer('done'), user('fix the tests\n\nAttached files:\n- attachments/log.txt'), answer('ok')]);
    await press(view, 'ArrowUp');
    expect(box(view).element.value).toBe('fix the tests');
    view.unmount();
  });

  it('QA58-E13 Esc does nothing with text in the box, with the slash list open, or with nothing to stop', async () => {
    const running = await chat('running', [user('go')]);
    await box(running.view).setValue('half a thought');
    await press(running.view, 'Escape');
    await box(running.view).setValue('/comp');
    await press(running.view, 'Escape');
    expect(running.view.find('[data-test="slash-list"]').exists()).toBe(false);
    expect(cancels(running.fake)).toHaveLength(0);
    running.view.unmount();
    const idle = await chat('idle', [user('go')]);
    await press(idle.view, 'Escape');
    expect(cancels(idle.fake)).toHaveLength(0);
    idle.view.unmount();
  });

  it('QA58-E14 Up leaves the box as it is with text in it, in a chat with no message from the person, and in the slash list', async () => {
    const typed = await chat('idle', [user('earlier')]);
    await box(typed.view).setValue('new words');
    await press(typed.view, 'ArrowUp');
    expect(box(typed.view).element.value).toBe('new words');
    await box(typed.view).setValue('/');
    await press(typed.view, 'ArrowUp');
    expect(box(typed.view).element.value).toBe('/');
    typed.view.unmount();
    const empty = await chat('idle', [answer('hello')]);
    // The draft is kept per chat in the page's memory, so the one left above is cleared first.
    await box(empty.view).setValue('');
    await press(empty.view, 'ArrowUp');
    expect(box(empty.view).element.value).toBe('');
    empty.view.unmount();
  });
});

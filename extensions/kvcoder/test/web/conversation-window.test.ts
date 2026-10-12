import { flushPromises } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ConversationView from '../../web/src/ConversationView.vue';
import { createFakeKvman } from './support/fake-kvman.ts';
import { mounted, serve, session, turn, user } from './support/fixtures.ts';

type Wrapper = Awaited<ReturnType<typeof mounted>>;
const shown = (view: Wrapper) => view.findAll('[data-test="user-message"]').map((item) => item.text());

// A chat whose messages the fake lists as kvcoder does: the newest `limit`, after `afterSeq`, or before `beforeSeq`.
function longChat(count: number) {
  const fake = createFakeKvman();
  const all = Array.from({ length: count }, (_, seq) => user(`m${String(seq)}`, { seq, id: `id${String(seq)}` }));
  serve(fake, { found: session(), messages: [], omitted: 0, turns: [turn({ outcome: 'done', endedAt: '2026-10-01T09:01:00.000Z' })] });
  fake.handle('kvcoder.message.list', (input) => {
    const limit = Number(input['limit']);
    const before = typeof input['beforeSeq'] === 'number' ? input['beforeSeq'] : all.length;
    const after = typeof input['afterSeq'] === 'number' ? input['afterSeq'] : -1;
    const messages = all.slice(Math.max(before - limit, 0), before).filter((message) => (message.seq ?? 0) > after);
    return { messages, omitted: typeof input['beforeSeq'] === 'number' ? (messages[0]?.seq ?? 0) : all.length - messages.length };
  });
  fake.handle('kvcoder.message.send', (input) => {
    all.push(user(String(input['text']), { seq: all.length, id: `id${String(all.length)}` }));
    return {};
  });
  return { fake, all };
}
async function send(view: Wrapper, text: string): Promise<void> {
  await view.find('[data-test="composer-text"]').setValue(text);
  await view.find('[data-test="composer-text"]').trigger('keydown', { key: 'Enter' });
  await flushPromises();
}
function scrollTo(view: Wrapper, fromEnd: number): void {
  const list = view.find('.kvc-scroll').element;
  Object.defineProperty(list, 'scrollHeight', { configurable: true, value: 5000 });
  Object.defineProperty(list, 'clientHeight', { configurable: true, value: 500 });
  Object.defineProperty(list, 'scrollTop', { configurable: true, writable: true, value: 4500 - fromEnd });
  list.dispatchEvent(new Event('scroll'));
}

describe('the conversation holds a window of messages (KVC-23, ADR 0059)', () => {
  it('M2.4-E191 at the latest a new message drops the oldest shown, and Show earlier brings a page back above', async () => {
    const { fake } = longChat(205);
    const view = await mounted(ConversationView, fake, { sessionId: 's1' });
    expect(shown(view)).toHaveLength(200);
    expect(view.find('[data-test="earlier"]').text()).toBe('5 earlier messages · Export');
    await send(view, 'new one');
    expect(shown(view)).toHaveLength(200);
    expect(shown(view).at(0)).toBe('m6');
    expect(shown(view).at(-1)).toBe('new one');
    expect(view.find('[data-test="show-earlier"]').text()).toBe('Show 6 earlier messages');
    await view.find('[data-test="show-earlier"]').trigger('click');
    await flushPromises();
    expect(shown(view)).toHaveLength(206);
    expect(shown(view).at(0)).toBe('m0');
    expect(view.find('[data-test="show-earlier"]').exists()).toBe(false);
    await send(view, 'after earlier');
    expect(shown(view)).toHaveLength(207);
    view.unmount();
  });

  it('M2.4-E191 while the person reads further up nothing is dropped, and Jump to latest returns to the newest window', async () => {
    const { fake, all } = longChat(200);
    fake.handle('kvcoder.session.get', () => session({ status: 'running' }));
    fake.handle('kvcoder.turn.cancel', () => ({}));
    const view = await mounted(ConversationView, fake, { sessionId: 's1' });
    scrollTo(view, 2000);
    await flushPromises();
    // A message arrives while the person reads further up; Stop reads the conversation again without returning to the end.
    all.push(user('while reading', { seq: all.length, id: 'arrived' }));
    await view.find('[data-test="stop"]').trigger('click');
    await flushPromises();
    expect(shown(view)).toHaveLength(201);
    expect(shown(view).at(0)).toBe('m0');
    await view.find('[data-test="jump-to-latest"]').trigger('click');
    await flushPromises();
    await send(view, 'back at the latest');
    expect(shown(view)).toHaveLength(200);
    expect(shown(view).at(0)).toBe('m2');
    view.unmount();
  });
});

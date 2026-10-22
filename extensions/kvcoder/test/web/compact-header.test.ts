import { flushPromises } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ConversationView from '../../web/src/ConversationView.vue';
import { createFakeKvman } from './support/fake-kvman.ts';
import { mounted, serve, session, turn } from './support/fixtures.ts';

// The header's row in a narrow host (08 §8.7, ADR 0100, 15): History, the header, and New chat in one row. Below 60 rem
// is the stylesheet's rule; the row and its buttons are here.
describe('the compact header (08 §8.7, ADR 0100, 15)', () => {
  it('M4.5-H1 one row holds History, the header, and New chat; History opens the drawer and New chat the Chat page', async () => {
    const fake = createFakeKvman();
    serve(fake, { found: session({ status: 'idle', title: 'Fix the login bug' }), messages: [], omitted: 0, turns: [turn({ outcome: 'done', endedAt: '2026-10-01T09:01:00.000Z' })] });
    fake.handle('kvcoder.session.list', () => [session({ id: 's1', title: 'Fix the login bug' })]);
    const view = await mounted(ConversationView, fake, { sessionId: 's1' });
    const row = view.find('[data-test="topline"]');
    expect(row.findAll(':scope > *').map((child) => child.attributes('data-test') ?? child.classes().join(' '))).toEqual(['chats-bar', expect.stringContaining('kvc-header') as unknown, 'kvc-new-chat']);
    const history = row.find('[data-test="chats-open"]');
    expect([history.attributes('aria-label'), history.text()]).toEqual(['History', '']);
    expect(row.find('[data-test="session-title"]').text()).toBe('Fix the login bug');
    const newChat = row.find('[data-test="new-chat-compact"]');
    expect([newChat.attributes('aria-label'), newChat.text()]).toEqual(['New chat', '']);
    await history.trigger('click');
    await flushPromises();
    expect(view.find('[data-test="chats-drawer"]').exists()).toBe(true);
    await newChat.trigger('click');
    expect(fake.navigate.mock.calls.at(-1)).toEqual(['kvcoder.chat']);
    view.unmount();
  });
});

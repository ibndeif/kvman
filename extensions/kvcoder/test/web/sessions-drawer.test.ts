import { flushPromises } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ChatsDrawer from '../../web/src/ChatsDrawer.vue';
import { createFakeKvman } from './support/fake-kvman.ts';
import { mounted, session } from './support/fixtures.ts';

// The chat list as a drawer on a narrow page (08 §8.7, ADR 0093, 3); its width rule is the stylesheet's, checked in
// Chromium (narrow-layout.test.ts).
describe('the chats drawer (ADR 0093, 3)', () => {
  it('QA61-H7 Chats opens the list over the page, and Escape, a press outside, or another chat closes it', async () => {
    const fake = createFakeKvman();
    fake.handle('kvcoder.session.list', () => [session({ id: 'a', title: 'First' }), session({ id: 'b', title: 'Second' })]);
    const view = await mounted(ChatsDrawer, fake, { sessionId: 'a' });
    const drawer = () => view.find('[data-test="chats-drawer"]');
    expect(drawer().exists()).toBe(false);
    await view.find('[data-test="chats-open"]').trigger('click');
    await flushPromises();
    expect(drawer().findAll('.kvc-session').map((row) => row.text())).toEqual([expect.stringContaining('First') as unknown, expect.stringContaining('Second') as unknown]);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await flushPromises();
    expect(drawer().exists()).toBe(false);
    await view.find('[data-test="chats-open"]').trigger('click');
    await view.find('[data-test="chats-backdrop"]').trigger('click');
    expect(drawer().exists()).toBe(false);
    await view.find('[data-test="chats-open"]').trigger('click');
    await view.setProps({ sessionId: 'b' });
    expect(drawer().exists()).toBe(false);
    view.unmount();
  });
});

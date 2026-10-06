import { describe, expect, it } from 'vitest';
import SessionList from '../../web/src/SessionList.vue';
import { createFakeKvman } from './support/fake-kvman.ts';
import { mounted, session } from './support/fixtures.ts';

describe('the session list (ADR 0009, 104)', () => {
  it('M2.4-E59 and QA33-E5 titles as they are, status, Today and Earlier, the open chat, and New chat', async () => {
    const fake = createFakeKvman();
    const now = new Date().toISOString();
    fake.handle('kvcoder.session.list', () => [
      session({ id: 'a', title: 'Running one', status: 'running', updatedAt: now }),
      session({ id: 'b', title: 'Waiting one', status: 'waiting', updatedAt: now }),
      session({ id: 'w', title: 'Notes page', updatedAt: '2026-01-02T09:00:00.000Z' }),
      session({ id: 'n', title: '', updatedAt: '2026-01-01T09:00:00.000Z' }),
    ]);
    const wrapper = await mounted(SessionList, fake, { sessionId: 'b' });
    expect(wrapper.findAll('.kvc-group').map((group) => group.text())).toEqual(['Today', 'Earlier']);
    expect(wrapper.find('[data-test="session-a"] [data-test="running"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="session-b"] [data-test="needs-you"]').text()).toBe('Needs you');
    expect(wrapper.find('[data-test="session-b"]').attributes('aria-current')).toBe('page');
    expect(wrapper.find('[data-test="session-w"]').text()).toContain('Notes page');
    expect(wrapper.find('[data-test="session-n"]').text()).toContain('New chat');
    await wrapper.find('[data-test="session-a"]').trigger('click');
    expect(fake.navigate).toHaveBeenCalledWith('kvcoder.session', { sessionId: 'a' });
    await wrapper.find('[data-test="new-chat"]').trigger('click');
    expect(fake.navigate).toHaveBeenLastCalledWith('kvcoder.chat');
    wrapper.unmount();
  });
});

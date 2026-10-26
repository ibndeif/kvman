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
      session({ id: 'b', title: 'Waiting one', status: 'waiting', waitingOn: 'person', updatedAt: now }),
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

  it('QA59-H11 Needs you only for a chat that waits on the person, whatever its status; a chat on its helpers is working', async () => {
    const fake = createFakeKvman();
    const now = new Date().toISOString();
    fake.handle('kvcoder.session.list', () => [
      session({ id: 'p', status: 'waiting', waitingOn: 'person', updatedAt: now }),
      session({ id: 'i', status: 'idle', waitingOn: 'person', updatedAt: now }),
      session({ id: 'h', status: 'waiting', waitingOn: 'helpers', updatedAt: now }),
      session({ id: 'r', status: 'running', updatedAt: now }),
    ]);
    const wrapper = await mounted(SessionList, fake, {});
    const mark = (id: string): string | undefined => ['needs-you', 'running'].find((name) => wrapper.find(`[data-test="session-${id}"] [data-test="${name}"]`).exists());
    expect(['p', 'i', 'h', 'r'].map(mark)).toEqual(['needs-you', 'needs-you', 'running', 'running']);
    wrapper.unmount();
  });

  it('M4.8-H14 a title in the list reads in its own direction', async () => {
    const fake = createFakeKvman();
    fake.handle('kvcoder.session.list', () => [session({ id: 'r', title: 'مراجعة kvcoder وتحسين الأداء' })]);
    const wrapper = await mounted(SessionList, fake, {});
    const title = wrapper.find('[data-test="session-r"] [data-test="session-list-title"]');
    expect([title.attributes('dir'), title.text()]).toEqual(['auto', 'مراجعة kvcoder وتحسين الأداء']);
    wrapper.unmount();
  });
});

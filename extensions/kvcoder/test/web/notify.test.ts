import { flushPromises } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '../../src/index.ts';
import ConversationView from '../../web/src/ConversationView.vue';
import SessionList from '../../web/src/SessionList.vue';
import { createFakeKvman, type FakeKvman } from './support/fake-kvman.ts';
import { mounted, serve, session, turn, user } from './support/fixtures.ts';

// A chat that starts needing the person while the page is hidden is notified, once the person allowed it (ADR 0091, 7).

type Shown = { title: string; body: string | undefined; onclick: (() => void) | null; closed: boolean };
const shown: Shown[] = [];
let permission: NotificationPermission = 'granted';
class FakeNotification {
  static get permission(): NotificationPermission { return permission; }
  static requestPermission = vi.fn(async (): Promise<NotificationPermission> => { permission = 'granted'; return permission; });
  onclick: (() => void) | null = null;
  constructor(title: string, options?: { body?: string }) {
    const notice: Shown = { title, body: options?.body, onclick: null, closed: false };
    shown.push(notice);
    Object.defineProperty(this, 'onclick', { set: (handler: () => void) => { notice.onclick = handler; } });
  }
  close(): void {
    const notice = shown.at(-1);
    if (notice !== undefined) notice.closed = true;
  }
}

let visibility: DocumentVisibilityState = 'hidden';
beforeEach(() => {
  shown.splice(0);
  permission = 'granted';
  visibility = 'hidden';
  vi.stubGlobal('Notification', FakeNotification);
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  localStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function listWorld(...reads: Session[][]): FakeKvman {
  const fake = createFakeKvman();
  let index = 0;
  fake.handle('kvcoder.session.list', () => reads[Math.min(index++, reads.length - 1)] ?? []);
  return fake;
}

async function nextRead(): Promise<void> {
  vi.advanceTimersByTime(5_000);
  await flushPromises();
}

describe('notifications and the one-time line (08 §8.7, ADR 0091, 7)', () => {
  it('QA59-H12 a chat newly needing the person while the page is hidden is notified once, and the notice opens it', async () => {
    const before = [session({ id: 'a', title: 'Build the page', waitingOn: null })];
    const after = [session({ id: 'a', title: 'Build the page', status: 'waiting', waitingOn: 'person' })];
    const fake = listWorld(before, after, after);
    const wrapper = await mounted(SessionList, fake, {});
    await nextRead();
    await nextRead();
    expect(shown.map((notice) => [notice.title, notice.body])).toEqual([['A chat needs you', 'Build the page']]);
    shown[0]?.onclick?.();
    expect(fake.navigate).toHaveBeenCalledWith('kvcoder.session', { sessionId: 'a' });
    wrapper.unmount();
  });

  it('QA59-E10 nothing while the page is visible, without permission, or for a chat already needing the person', async () => {
    const waiting = [session({ id: 'a', status: 'waiting', waitingOn: 'person' })];
    const quiet = [session({ id: 'a', waitingOn: null })];
    visibility = 'visible';
    const visible = await mounted(SessionList, listWorld(quiet, waiting), {});
    await nextRead();
    visible.unmount();
    visibility = 'hidden';
    permission = 'denied';
    const denied = await mounted(SessionList, listWorld(quiet, waiting), {});
    await nextRead();
    denied.unmount();
    permission = 'granted';
    const already = await mounted(SessionList, listWorld(waiting, waiting), {});
    await nextRead();
    already.unmount();
    expect(shown).toEqual([]);
  });

  it('QA59-H13 a chat waiting on the person asks once to turn notices on, and Not now is remembered', async () => {
    permission = 'default';
    const fake = createFakeKvman();
    serve(fake, { found: session({ status: 'waiting', waitingOn: 'person' }), messages: [user('go')], omitted: 0, turns: [turn()] });
    const view = await mounted(ConversationView, fake, { sessionId: 's1' });
    expect(view.find('[data-test="notify-line"]').text()).toContain('Get a notice when a chat needs you while kvman is in the background.');
    await view.find('[data-test="notify-on"]').trigger('click');
    await flushPromises();
    expect(FakeNotification.requestPermission).toHaveBeenCalledOnce();
    expect(view.find('[data-test="notify-line"]').exists()).toBe(false);
    view.unmount();
    permission = 'default';
    const again = await mounted(ConversationView, fake, { sessionId: 's1' });
    await again.find('[data-test="notify-later"]').trigger('click');
    again.unmount();
    const later = await mounted(ConversationView, fake, { sessionId: 's1' });
    expect(later.find('[data-test="notify-line"]').exists()).toBe(false);
    later.unmount();
  });

  it('QA59-E10 a page with no notifications shows no line', async () => {
    vi.unstubAllGlobals();
    vi.stubGlobal('Notification', undefined);
    const fake = createFakeKvman();
    serve(fake, { found: session({ status: 'waiting', waitingOn: 'person' }), messages: [user('go')], omitted: 0, turns: [turn()] });
    const view = await mounted(ConversationView, fake, { sessionId: 's1' });
    expect(view.find('[data-test="notify-line"]').exists()).toBe(false);
    view.unmount();
  });
});

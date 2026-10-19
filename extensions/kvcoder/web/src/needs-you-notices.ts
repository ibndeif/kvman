import type { Kvman } from '@kvman/sdk/web';
import type { Session } from '../../src/index.ts';
import { titleText } from './kvman.ts';

// Telling the person a chat needs them (plan 08 §8.7, ADR 0091, 7): a system notification, when they allowed them,
// for a chat that starts waiting on them while the page isn't visible. The first read of a workspace only learns.

/** Where the browser keeps that the person chose "Not now". */
export const declinedKey = 'kvcoder.notify.declined';

/** Whether this page can show system notifications at all; the desktop app's engine may not. */
export const notificationsAvailable = (): boolean => typeof Notification !== 'undefined';

function show(kvman: Kvman, session: Session): void {
  const notice = new Notification(kvman.t('kvcoder.ui.notify.title'), { body: titleText(kvman.t, session.title), tag: `kvcoder-${session.id}` });
  notice.onclick = () => {
    window.focus();
    kvman.navigate('kvcoder.session', { sessionId: session.id });
    notice.close();
  };
}

/** Called with each read of the session list; notifies for the chats that newly need the person. */
export function needsYouNotices(kvman: Kvman): (workspaceId: string, sessions: readonly Session[]) => void {
  let seen: { workspaceId: string; ids: Set<string> } | undefined;
  return (workspaceId, sessions) => {
    const ids = new Set(sessions.filter((session) => session.waitingOn === 'person').map((session) => session.id));
    const before = seen?.workspaceId === workspaceId ? seen.ids : undefined;
    seen = { workspaceId, ids };
    if (before === undefined || !notificationsAvailable() || Notification.permission !== 'granted' || document.visibilityState !== 'hidden') return;
    for (const session of sessions) if (ids.has(session.id) && !before.has(session.id)) show(kvman, session);
  };
}

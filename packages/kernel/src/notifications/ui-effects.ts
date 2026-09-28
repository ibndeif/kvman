import { addressSchema, type Address, type Message } from '@kvman/protocol';
import { mutedExtensions } from '../preferences/user-preferences.ts';
import type { UiPush, UiSend } from '../storage/commit-unit.ts';
import type { Connection } from '../storage/driver.ts';
import { applyCap, dismissByKey, foldExcess, storeNotification, type TrayWrite } from './tray-rows.ts';

// 08 §8.11: per extension and workspace, 20 toasts and 10 notifications in the last 60 s (ADR 0162).
export const uiLimits = { windowMs: 60_000, toasts: 20, notifications: 10 } as const;

// What a ui.* send did at commit: its row's target, what the stream pushes, and the trays that changed ('' for the
// global entries).
export type UiEffect = { target: Address; push: UiPush | undefined; changed: string[] };

const localUser: Address = 'user:local';
const tabSource = /^user:[^/]+\/client:(.+)$/;

// ADR 0162: a toast or navigate goes to the tab that started the correlation, when a tab did.
function startingTab(connection: Connection, message: Message): { target: Address; clientId: string } | undefined {
  const root = connection.prepare('SELECT source FROM messages WHERE id = ?').get(message.correlationId);
  if (root === undefined) return undefined;
  const source = addressSchema.parse(root['source']);
  const clientId = tabSource.exec(source)?.[1];
  return clientId === undefined ? undefined : { target: source, clientId };
}

function extensionOf(message: Message): string | undefined {
  return message.source.startsWith('ext:') ? message.source.slice('ext:'.length) : undefined;
}

// The stored ui.* rows of the same type, source, and workspace in the window, before this one (ADR 0162). The
// `type IN` term matches the partial index messages_ui.
function sentInWindow(write: TrayWrite, message: Message): number {
  const row = write.connection
    .prepare(`SELECT COUNT(*) AS sent FROM messages WHERE type IN ('ui.toast', 'ui.notify') AND type = ? AND source = ?
      AND workspace_id IS ? AND created_at > ?`)
    .get(message.type, message.source, message.workspaceId ?? null, write.now - uiLimits.windowMs);
  return Number(row?.['sent'] ?? 0);
}

function overLimit(write: TrayWrite, message: Message): boolean {
  if (extensionOf(message) === undefined) return false;
  const limit = message.type === 'ui.toast' ? uiLimits.toasts : uiLimits.notifications;
  return sentInWindow(write, message) >= limit;
}

// ADR 0163: a muted extension's toasts and notifications in that workspace are not pushed; the kernel's never are muted.
function muted(connection: Connection, message: Message, ws: string): boolean {
  const extension = extensionOf(message);
  return extension !== undefined && mutedExtensions(connection, ws).includes(extension);
}

function withWorkspace(ws: string): { workspaceId?: string } {
  return ws === '' ? {} : { workspaceId: ws };
}

// ADR 0162: a checked ui.* send's effect in the commit's transaction. The row itself is stored by the caller, after
// this, so the rate count sees only the earlier sends.
export function applyUiSend(write: TrayWrite, message: Message, ui: UiSend): UiEffect {
  const { connection } = write;
  const { source } = message;
  const messageWs = message.workspaceId ?? '';
  if (ui.kind === 'dismiss') {
    const changed = dismissByKey(write, { ws: messageWs, source, key: ui.key }) ? [messageWs] : [];
    return { target: localUser, push: { ...withWorkspace(messageWs), type: 'ui.dismiss', source, payload: { key: ui.key } }, changed };
  }
  if (ui.kind === 'navigate') {
    const tab = startingTab(connection, message);
    if (tab === undefined) return { target: localUser, push: undefined, changed: [] };
    return { target: tab.target, push: { clientId: tab.clientId, ...withWorkspace(messageWs), type: 'ui.navigate', source, payload: { route: ui.route } }, changed: [] };
  }
  const tab = ui.kind === 'toast' ? startingTab(connection, message) : undefined;
  const target = tab?.target ?? localUser;
  if (overLimit(write, message)) {
    foldExcess(write, { id: ui.entryId, ws: messageWs, source });
    return { target, push: undefined, changed: [messageWs] };
  }
  if (ui.kind === 'toast') {
    const push: UiPush = { ...(tab === undefined ? {} : { clientId: tab.clientId }), ...withWorkspace(messageWs), type: 'ui.toast', source, payload: ui.toast };
    return { target, push: muted(connection, message, messageWs) ? undefined : push, changed: [] };
  }
  const trayWs = ui.notification.global === true ? '' : messageWs;
  storeNotification(write, { id: ui.entryId, ws: trayWs, source, notification: ui.notification });
  applyCap(write, trayWs);
  const push: UiPush = { ...withWorkspace(trayWs), type: 'ui.notify', source, payload: ui.notification };
  return { target, push: muted(connection, message, trayWs) ? undefined : push, changed: [trayWs] };
}

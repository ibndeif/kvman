import {
  dismissSchema, emptyResultSchema, messageRetryRequestSchema, navigateSchema, notificationRequestSchema, notificationSchema, notificationsChangedSchema,
  notificationsCountRequestSchema, notificationsCountResultSchema, notificationsListRequestSchema, notificationsListResultSchema,
  notificationsMuteRequestSchema, notificationsReadAllRequestSchema, toastSchema, uiSendResultSchema, type TypeEntry,
} from '@kvman/protocol';
import { jsonDocument } from './kernel-json-schemas.ts';
import { command, query } from './kernel-workspace-types.ts';

type Schema = Parameters<typeof jsonDocument>[0];

// 02 §2.4, ADR 0162: only extensions (with `ui`) and the kernel send the ui.* types, which the kernel handles at commit.
function uiCommand(type: string, description: string, input: Schema): TypeEntry {
  return {
    type, kind: 'command', access: 'extensions', handler: `command:${type}`, description,
    input: jsonDocument(input, 'input'), output: jsonDocument(uiSendResultSchema, 'output'),
  };
}

// 08 §8.11, 03 §3.8 (M2.12, ADRs 0162–0164).
export function notificationEntries(): TypeEntry[] {
  return [
    uiCommand('ui.toast', "Shows a short toast in the tabs of the message's workspace, or only in the tab whose click started the chain.", toastSchema),
    uiCommand('ui.notify', "Stores a notification in the workspace's tray (or every tray when global); the same key replaces the sender's earlier one.", notificationSchema),
    uiCommand('ui.dismiss', "Removes the sender's toast and tray notification with this key.", dismissSchema),
    uiCommand('ui.navigate', 'Opens a route in the tab that started the chain; dropped when no tab started it.', navigateSchema),
    query('kernel.notifications.list', 'The notification tray: a workspace and the global entries, or every entry; newest first, unread attention entries on top. Admin only.', notificationsListRequestSchema, notificationsListResultSchema),
    query('kernel.notifications.count', 'The unread and attention counts of the tray for the badge; muted entries are not counted.', notificationsCountRequestSchema, notificationsCountResultSchema),
    command('kernel.notification.read', 'user', 'Marks one tray notification read.', notificationRequestSchema, emptyResultSchema),
    command('kernel.notification.dismiss', 'user', 'Removes one tray notification.', notificationRequestSchema, emptyResultSchema),
    command('kernel.notifications.read-all', 'user', 'Marks every notification of a workspace and the global ones read, or every one.', notificationsReadAllRequestSchema, emptyResultSchema),
    command('kernel.notifications.mute', 'user', "Mutes or unmutes an extension's notifications in a workspace: stored, but no toast, badge, or alert.", notificationsMuteRequestSchema, emptyResultSchema),
    {
      type: 'kernel.notifications.changed', kind: 'event', delivery: 'transient',
      description: 'The tray changed: an entry was stored, replaced, read, dismissed, muted, or removed. Absent workspaceId names the global entries.',
      payload: jsonDocument(notificationsChangedSchema, 'input'),
    },
    command('kernel.message.retry', 'all', 'Runs a dead message again with its attempts reset, or a pending one at once. Admin only.', messageRetryRequestSchema, emptyResultSchema),
  ];
}

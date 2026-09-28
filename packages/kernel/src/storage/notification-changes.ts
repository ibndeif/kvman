import type { Json } from '@kvman/protocol';
import { trimTray } from '../notifications/tray-housekeeping.ts';
import { visibleEntry } from '../notifications/tray-rows.ts';
import { readStoredPreferences } from '../preferences/user-preferences.ts';
import { kernelProblem } from '../problems.ts';
import { writeStoredPreferences } from './preference-changes.ts';
import { publishTrayChange, UnitRejected, type UnitScope } from './unit-contents.ts';

// The person's tray commands (08 §8.11, ADR 0163) and the kernel's retention (04 §4.9), each applied with its
// kernel.notifications.changed.
export type NotificationChange =
  | { kind: 'notifications.trim' }
  | { kind: 'notification.read'; id: string }
  | { kind: 'notification.dismiss'; id: string }
  | { kind: 'notifications.read-all'; workspaceId: string | undefined }
  | { kind: 'notifications.mute'; workspaceId: string; extension: string; muted: boolean };

function entryOrNotFound(scope: UnitScope, id: string): string {
  const row = visibleEntry(scope.connection, id, scope.now);
  if (row === undefined) throw new UnitRejected(kernelProblem('NOT_FOUND', { correlationId: scope.correlationId, detail: `no notification ${id} is in the tray` }));
  return String(row['ws']);
}

function read(scope: UnitScope, id: string): void {
  const ws = entryOrNotFound(scope, id);
  const result = scope.connection.prepare('UPDATE notifications SET read_at = ? WHERE id = ? AND read_at IS NULL').run(scope.now, id);
  if (result.changes > 0) publishTrayChange(scope, ws);
}

function dismiss(scope: UnitScope, id: string): void {
  const ws = entryOrNotFound(scope, id);
  scope.connection.prepare('UPDATE notifications SET dismissed_at = ? WHERE id = ?').run(scope.now, id);
  publishTrayChange(scope, ws);
}

// With a workspace, its unread entries and the global ones; without one, every unread entry.
function readAll(scope: UnitScope, workspaceId: string | undefined): void {
  const visible = 'read_at IS NULL AND dismissed_at IS NULL AND (expires_at IS NULL OR expires_at > ?)';
  const where = workspaceId === undefined ? visible : `${visible} AND ws IN (?, '')`;
  const values = workspaceId === undefined ? [scope.now] : [scope.now, workspaceId];
  const touched = scope.connection.prepare(`SELECT DISTINCT ws FROM notifications WHERE ${where} ORDER BY ws`).all(...values).map((row) => String(row['ws']));
  scope.connection.prepare(`UPDATE notifications SET read_at = ? WHERE ${where}`).run(scope.now, ...values);
  for (const ws of touched) publishTrayChange(scope, ws);
}

function mute(scope: UnitScope, change: Extract<NotificationChange, { kind: 'notifications.mute' }>): void {
  const stored = readStoredPreferences(scope.connection);
  const current = stored.muted?.[change.workspaceId] ?? [];
  if (current.includes(change.extension) === change.muted) return;
  const next = change.muted ? [...current, change.extension].sort() : current.filter((name) => name !== change.extension);
  const { [change.workspaceId]: _previous, ...others } = stored.muted ?? {};
  const muted = next.length === 0 ? others : { ...others, [change.workspaceId]: next };
  const { muted: _stored, ...preferences } = stored;
  writeStoredPreferences(scope, Object.keys(muted).length === 0 ? preferences : { ...preferences, muted });
  publishTrayChange(scope, change.workspaceId);
}

export function applyNotificationChange(scope: UnitScope, change: NotificationChange): Json {
  if (change.kind === 'notification.read') read(scope, change.id);
  else if (change.kind === 'notification.dismiss') dismiss(scope, change.id);
  else if (change.kind === 'notifications.read-all') readAll(scope, change.workspaceId);
  else if (change.kind === 'notifications.mute') mute(scope, change);
  else for (const ws of trimTray(scope.connection, scope.now)) publishTrayChange(scope, ws);
  return {};
}

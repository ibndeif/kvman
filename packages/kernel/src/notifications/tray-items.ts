import { jsonObjectSchema, notificationItemSchema, type NotificationItem, type NotificationsCountResult } from '@kvman/protocol';
import { readStoredPreferences } from '../preferences/user-preferences.ts';
import type { Connection, SqlRow, SqlValue } from '../storage/driver.ts';

// ADR 0163: with a workspace, its entries and the global ones; without one, every entry. Dismissed and expired entries
// are never shown.
export type TrayScope = { workspaceId: string | undefined; now: number };

function scopeFilter(scope: TrayScope): { sql: string; values: SqlValue[] } {
  const visible = 'dismissed_at IS NULL AND (expires_at IS NULL OR expires_at > ?)';
  if (scope.workspaceId === undefined) return { sql: visible, values: [scope.now] };
  return { sql: `${visible} AND ws IN (?, '')`, values: [scope.now, scope.workspaceId] };
}

// A muted extension's entries in a workspace (never the global ones, never the kernel's).
function mutedCheck(connection: Connection): (row: SqlRow) => boolean {
  const muted = readStoredPreferences(connection).muted ?? {};
  return (row) => {
    const ws = String(row['ws']);
    const source = String(row['source']);
    return ws !== '' && source.startsWith('ext:') && (muted[ws] ?? []).includes(source.slice('ext:'.length));
  };
}

function optionalNumber(value: SqlValue | undefined): number | undefined {
  return value === null || value === undefined ? undefined : Number(value);
}

function itemOf(row: SqlRow, muted: boolean): NotificationItem {
  const data = jsonObjectSchema.parse(JSON.parse(String(row['data'])));
  const ws = String(row['ws']);
  const expiresAt = optionalNumber(row['expires_at']);
  return notificationItemSchema.parse({
    ...data, id: row['id'], ...(ws === '' ? {} : { workspaceId: ws }), source: row['source'], ...(row['key'] === null ? {} : { key: row['key'] }),
    level: row['level'], attention: Number(row['attention']) === 1, ...(expiresAt === undefined ? {} : { expiresAt }),
    read: row['read_at'] !== null, muted, createdAt: Number(row['created_at']), updatedAt: Number(row['updated_at']),
  });
}

// 08 §8.11: newest first by updated_at, with unread attention entries pinned to the top.
export function listTray(connection: Connection, scope: TrayScope, unreadOnly: boolean): NotificationItem[] {
  const filter = scopeFilter(scope);
  const unread = unreadOnly ? ' AND read_at IS NULL' : '';
  const rows = connection
    .prepare(`SELECT * FROM notifications WHERE ${filter.sql}${unread}
      ORDER BY (read_at IS NULL AND attention = 1) DESC, updated_at DESC, id DESC`)
    .all(...filter.values);
  const isMuted = mutedCheck(connection);
  return rows.map((row) => itemOf(row, isMuted(row)));
}

// The badge (ADR 0163): unread entries that are not muted, and those among them that need attention.
export function countTray(connection: Connection, scope: TrayScope): NotificationsCountResult {
  const filter = scopeFilter(scope);
  const rows = connection.prepare(`SELECT ws, source, attention FROM notifications WHERE ${filter.sql} AND read_at IS NULL`).all(...filter.values);
  const isMuted = mutedCheck(connection);
  const counted = rows.filter((row) => !isMuted(row));
  return { unread: counted.length, attention: counted.filter((row) => Number(row['attention']) === 1).length };
}

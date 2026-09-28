import type { Level, Notification } from '@kvman/protocol';
import type { Connection, SqlRow } from '../storage/driver.ts';

// The tray's rows (04 §4.1): `ws` is '' for a global entry; `data` holds what the entry shows.
export type TrayWrite = { connection: Connection; now: number };

// 08 §8.11: the newest 200 per workspace are kept (ADR 0163: applied when an entry is stored).
export const trayCap = 200;

const levelRanks: Record<Level, number> = { info: 0, success: 1, warning: 2, error: 3 };

// A replacement that raises the level to warning or error is unread again (08 §8.11).
function raisesLevel(previous: Level, next: Level): boolean {
  return (next === 'warning' || next === 'error') && levelRanks[next] > levelRanks[previous];
}

function levelOf(value: unknown): Level {
  return value === 'success' || value === 'warning' || value === 'error' ? value : 'info';
}

function shownData(notification: Notification): string {
  const { title, body, problem, route, entity, actions } = notification;
  return JSON.stringify({
    title, ...(body === undefined ? {} : { body }), ...(problem === undefined ? {} : { problem }), ...(route === undefined ? {} : { route }),
    ...(entity === undefined ? {} : { entity }), ...(actions === undefined ? {} : { actions }),
  });
}

function insertEntry(write: TrayWrite, entry: { id: string; ws: string; source: string; key: string | null; level: Level; data: string; attention: boolean; expiresAt: number | null }): void {
  write.connection
    .prepare(`INSERT INTO notifications (id, ws, source, key, level, data, attention, read_at, dismissed_at, expires_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?)`)
    .run(entry.id, entry.ws, entry.source, entry.key, entry.level, entry.data, entry.attention ? 1 : 0, entry.expiresAt, write.now, write.now);
}

// ADR 0162: the same source, workspace, and key replace the entry in place (id and created_at kept, read state kept
// unless the level rises); a dismissed entry with the key gives way to a fresh one.
export function storeNotification(write: TrayWrite, stored: { id: string; ws: string; source: string; notification: Notification }): void {
  const { notification, ws, source } = stored;
  const level = notification.level ?? 'info';
  const key = notification.key ?? null;
  const shown = { data: shownData(notification), attention: notification.attention === true, expiresAt: notification.expiresAt ?? null };
  const existing = key === null ? undefined : write.connection.prepare('SELECT id, level, dismissed_at FROM notifications WHERE source = ? AND ws = ? AND key = ?').get(source, ws, key);
  if (existing !== undefined && existing['dismissed_at'] === null) {
    const unread = raisesLevel(levelOf(existing['level']), level);
    write.connection
      .prepare(`UPDATE notifications SET level = ?, data = ?, attention = ?, expires_at = ?, updated_at = ?,
        read_at = CASE WHEN ? THEN NULL ELSE read_at END WHERE id = ?`)
      .run(level, shown.data, shown.attention ? 1 : 0, shown.expiresAt, write.now, unread ? 1 : 0, String(existing['id']));
    return;
  }
  if (existing !== undefined) write.connection.prepare('DELETE FROM notifications WHERE id = ?').run(String(existing['id']));
  insertEntry(write, { id: stored.id, ws, source, key, level, ...shown });
}

// ADR 0162: an excess send raises the count of the extension's unread folded entry in the workspace, or starts one.
export function foldExcess(write: TrayWrite, folded: { id: string; ws: string; source: string }): void {
  const current = write.connection
    .prepare(`SELECT id, data FROM notifications WHERE source = ? AND ws = ? AND key IS NULL AND read_at IS NULL AND dismissed_at IS NULL
      AND json_extract(data, '$.folded') IS NOT NULL`)
    .get(folded.source, folded.ws);
  if (current === undefined) {
    insertEntry(write, { id: folded.id, ws: folded.ws, source: folded.source, key: null, level: 'info', data: JSON.stringify({ folded: 1 }), attention: false, expiresAt: null });
    return;
  }
  write.connection
    .prepare("UPDATE notifications SET data = json_set(data, '$.folded', json_extract(data, '$.folded') + 1), updated_at = ? WHERE id = ?")
    .run(write.now, String(current['id']));
}

// ui.dismiss: the sender's entry with the key in the message's workspace; whether one was dismissed.
export function dismissByKey(write: TrayWrite, dismissed: { ws: string; source: string; key: string }): boolean {
  const result = write.connection
    .prepare('UPDATE notifications SET dismissed_at = ? WHERE source = ? AND ws = ? AND key = ? AND dismissed_at IS NULL')
    .run(write.now, dismissed.source, dismissed.ws, dismissed.key);
  return result.changes > 0;
}

// Whether the workspace lost entries to the cap.
export function applyCap(write: TrayWrite, ws: string): boolean {
  const result = write.connection
    .prepare(`DELETE FROM notifications WHERE id IN (SELECT id FROM notifications WHERE ws = ? AND dismissed_at IS NULL
      ORDER BY updated_at DESC, id DESC LIMIT -1 OFFSET ?)`)
    .run(ws, trayCap);
  return result.changes > 0;
}

// A visible entry: neither dismissed nor expired.
export function visibleEntry(connection: Connection, id: string, now: number): SqlRow | undefined {
  return connection
    .prepare('SELECT * FROM notifications WHERE id = ? AND dismissed_at IS NULL AND (expires_at IS NULL OR expires_at > ?)')
    .get(id, now);
}

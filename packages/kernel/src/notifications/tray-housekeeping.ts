import type { Connection } from '../storage/driver.ts';

// 04 §4.9, ADR 0163: expired and dismissed entries, entries read more than 7 days ago, and entries not updated for 30
// days (the 200-entry cap is applied when an entry is stored).
export const trayRetention = { readMs: 7 * 24 * 60 * 60_000, keptMs: 30 * 24 * 60 * 60_000 } as const;

const removable = `expires_at <= ? OR dismissed_at IS NOT NULL OR read_at < ? OR updated_at < ?`;
const visible = 'dismissed_at IS NULL AND (expires_at IS NULL OR expires_at > ?)';

// Trims the tray and answers the workspaces ('' for the global entries) whose visible entries it removed.
export function trimTray(connection: Connection, now: number): string[] {
  const values = [now, now - trayRetention.readMs, now - trayRetention.keptMs];
  const changed = connection
    .prepare(`SELECT DISTINCT ws FROM notifications WHERE (${removable}) AND ${visible} ORDER BY ws`)
    .all(...values, now)
    .map((row) => String(row['ws']));
  connection.prepare(`DELETE FROM notifications WHERE ${removable}`).run(...values);
  return changed;
}

import type { Json, StoredPreferences, UserPreferences } from '@kvman/protocol';
import { localUserId, readStoredPreferences } from '../preferences/user-preferences.ts';
import { publishKernelEvent, type UnitScope } from './unit-contents.ts';

export type PreferenceChange = { kind: 'preferences.set'; preferences: UserPreferences };

// The one row of the local user, with its revision bumped.
export function writeStoredPreferences(scope: Pick<UnitScope, 'connection' | 'now'>, data: StoredPreferences): void {
  const row = scope.connection.prepare('SELECT revision FROM user_preferences WHERE user_id = ?').get(localUserId);
  const revision = row === undefined ? 1 : Number(row['revision']) + 1;
  scope.connection
    .prepare(`INSERT INTO user_preferences (user_id, data, revision, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, revision = excluded.revision, updated_at = excluded.updated_at`)
    .run(localUserId, JSON.stringify(data), revision, scope.now);
}

// 08 §8.16, ADR 0161: the preference row and its event, in one unit with the command's reply; the muted extensions
// stay (ADR 0163).
export function applyPreferenceChange(scope: UnitScope, change: PreferenceChange): Json {
  const { muted } = readStoredPreferences(scope.connection);
  writeStoredPreferences(scope, { ...change.preferences, ...(muted === undefined ? {} : { muted }) });
  publishKernelEvent(scope, undefined, { type: 'kernel.user.preferences.changed', payload: change.preferences });
  return {};
}

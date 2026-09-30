import type { TransactionKv } from '@kvman/sdk';
import type { Connection } from '../storage/database.ts';
import { parsedJson, storedText } from './json-values.ts';

// A scope of one extension's store: a workspace id, or '' for global.
export type ScopeKey = { extension: string; scope: string };

// `beforeWrite` runs before every write; a query's store throws READ_ONLY from it.
export type WriteGuard = () => void;

export function kvOf(connection: Connection, key: ScopeKey, beforeWrite: WriteGuard): TransactionKv {
  return {
    get(name) {
      const row = connection
        .prepare<[string, string, string], { value: string }>('SELECT value FROM store_kv WHERE extension = ? AND scope = ? AND key = ?')
        .get(key.extension, key.scope, name);
      return row === undefined ? undefined : parsedJson(row.value);
    },
    set(name, value) {
      beforeWrite();
      const text = storedText(value, `The kv value "${name}"`);
      connection
        .prepare('INSERT INTO store_kv (extension, scope, key, value) VALUES (?, ?, ?, ?) ON CONFLICT DO UPDATE SET value = excluded.value')
        .run(key.extension, key.scope, name, text);
    },
    delete(name) {
      beforeWrite();
      connection.prepare('DELETE FROM store_kv WHERE extension = ? AND scope = ? AND key = ?').run(key.extension, key.scope, name);
    },
  };
}

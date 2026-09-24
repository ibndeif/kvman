import type { StoreWrite } from '@kvman/protocol';
import { StorageFailure, type Connection, type SqlValue } from './driver.ts';

export type WriteOwner = { owner: string; workspaceId: string | undefined };

export class VersionConflict extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VersionConflict';
  }
}

// Argument order: select, remove (...key); removeAtVersion (...key, version); insert, upsert (...key, value, now for
// each timestamp column); update (value, now, ...key, version).
type KeyedTable = {
  timestampColumns: 1 | 2;
  select: string; insert: string; upsert: string; update: string; remove: string; removeAtVersion: string;
};

const kvTable: KeyedTable = {
  timestampColumns: 1,
  select: 'SELECT version FROM kv WHERE owner = ? AND ws = ? AND key = ?',
  insert: 'INSERT INTO kv (owner, ws, key, value, version, updated_at) VALUES (?, ?, ?, ?, 1, ?)',
  upsert: `INSERT INTO kv (owner, ws, key, value, version, updated_at) VALUES (?, ?, ?, ?, 1, ?)
    ON CONFLICT DO UPDATE SET value = excluded.value, version = version + 1, updated_at = excluded.updated_at`,
  update: 'UPDATE kv SET value = ?, version = version + 1, updated_at = ? WHERE owner = ? AND ws = ? AND key = ? AND version = ?',
  remove: 'DELETE FROM kv WHERE owner = ? AND ws = ? AND key = ?',
  removeAtVersion: 'DELETE FROM kv WHERE owner = ? AND ws = ? AND key = ? AND version = ?',
};

const docsTable: KeyedTable = {
  timestampColumns: 2,
  select: 'SELECT version FROM docs WHERE owner = ? AND ws = ? AND collection = ? AND id = ?',
  insert: 'INSERT INTO docs (owner, ws, collection, id, data, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)',
  upsert: `INSERT INTO docs (owner, ws, collection, id, data, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)
    ON CONFLICT DO UPDATE SET data = excluded.data, version = version + 1, updated_at = excluded.updated_at`,
  update: 'UPDATE docs SET data = ?, version = version + 1, updated_at = ? WHERE owner = ? AND ws = ? AND collection = ? AND id = ? AND version = ?',
  remove: 'DELETE FROM docs WHERE owner = ? AND ws = ? AND collection = ? AND id = ?',
  removeAtVersion: 'DELETE FROM docs WHERE owner = ? AND ws = ? AND collection = ? AND id = ? AND version = ?',
};

export class InvalidWrite extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidWrite';
  }
}

function conflictUnlessChanged(changes: number, what: string): void {
  if (changes === 0) throw new VersionConflict(`${what} changed since it was read`);
}

function insertOrConflict(insert: () => void, what: string): void {
  try {
    insert();
  } catch (error) {
    if (error instanceof StorageFailure && error.kind === 'constraint') throw new VersionConflict(`${what} already exists`);
    throw error;
  }
}

function setEntry(connection: Connection, table: KeyedTable, key: SqlValue[], value: string, expectedVersion: number | undefined, now: number): void {
  const what = key.join('/');
  const timestamps = Array.from({ length: table.timestampColumns }, () => now);
  if (expectedVersion === undefined) connection.prepare(table.upsert).run(...key, value, ...timestamps);
  else if (expectedVersion === 0) insertOrConflict(() => connection.prepare(table.insert).run(...key, value, ...timestamps), what);
  else conflictUnlessChanged(connection.prepare(table.update).run(value, now, ...key, expectedVersion).changes, what);
}

function deleteEntry(connection: Connection, table: KeyedTable, key: SqlValue[], expectedVersion: number | undefined): void {
  const what = key.join('/');
  if (expectedVersion === undefined) connection.prepare(table.remove).run(...key);
  else if (expectedVersion === 0) {
    if (connection.prepare(table.select).get(...key) !== undefined) throw new VersionConflict(`${what} exists although it was read as missing`);
  } else conflictUnlessChanged(connection.prepare(table.removeAtVersion).run(...key, expectedVersion).changes, what);
}

function workspaceOf(write: StoreWrite, owner: WriteOwner): string {
  if (write.scope === 'global') return '';
  if (owner.workspaceId === undefined) throw new InvalidWrite('a workspace-scope write needs an invocation in a workspace; use the global scope');
  return owner.workspaceId;
}

export function applyStoreWrite(connection: Connection, owner: WriteOwner, write: StoreWrite, now: number): void {
  const ws = workspaceOf(write, owner);
  switch (write.kind) {
    case 'kv.set':
      return setEntry(connection, kvTable, [owner.owner, ws, write.key], JSON.stringify(write.value), write.expectedVersion, now);
    case 'kv.delete':
      return deleteEntry(connection, kvTable, [owner.owner, ws, write.key], write.expectedVersion);
    case 'doc.put':
      return setEntry(connection, docsTable, [owner.owner, ws, write.collection, write.id], JSON.stringify(write.data), write.expectedVersion, now);
    case 'doc.delete':
      return deleteEntry(connection, docsTable, [owner.owner, ws, write.collection, write.id], write.expectedVersion);
    case 'log.append':
      return insertOrConflict(
        () => connection.prepare('INSERT INTO logs (owner, ws, log, seq, data, at) VALUES (?, ?, ?, ?, ?, ?)').run(owner.owner, ws, write.log, write.seq, JSON.stringify(write.value), now),
        `log ${write.log} seq ${write.seq}`,
      );
    case 'log.truncate-before':
      connection.prepare('DELETE FROM logs WHERE owner = ? AND ws = ? AND log = ? AND seq < ?').run(owner.owner, ws, write.log, write.seq);
      return undefined;
    case 'log.drop':
      connection.prepare('DELETE FROM logs WHERE owner = ? AND ws = ? AND log = ?').run(owner.owner, ws, write.log);
      return undefined;
  }
}

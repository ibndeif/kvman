import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { betterSqlite3Driver, latestKernelSchemaVersion, openKernelDatabase, openReadConnection, ProblemError, StorageFailure } from '../../src/index.ts';
import { rows, temporaryDatabaseFile, ulids } from './harness.ts';

const kernelTables = [
  'blob_refs', 'blobs', 'docs', 'events', 'extension_versions', 'extensions', 'global_config', 'kernel_settings', 'kv', 'llm_models',
  'llm_usage', 'logs', 'messages', 'notifications', 'presets', 'processes', 'recorded_values', 'schema_versions', 'steps', 'user_preferences',
  'workspace_config', 'workspace_presets', 'workspaces',
];

function sha256Of(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function modeOf(file: string): number {
  return statSync(file).mode & 0o777;
}

describe('opening the kernel database (plan 04 §4.1, §4.8)', () => {
  it('M1.1-H4 a newer schema refuses to open and writes no data', () => {
    const file = temporaryDatabaseFile();
    openKernelDatabase(file, betterSqlite3Driver, ulids.next()).close();
    const direct = new Database(file);
    direct.prepare("UPDATE schema_versions SET version = 99 WHERE owner = 'kernel'").run();
    direct.close();
    const before = sha256Of(file);
    let refusal: unknown;
    try {
      openKernelDatabase(file, betterSqlite3Driver, ulids.next());
    } catch (error) {
      refusal = error;
    }
    expect(refusal).toBeInstanceOf(ProblemError);
    expect(refusal instanceof ProblemError ? refusal.problem : undefined).toMatchObject({ code: 'SCHEMA_TOO_NEW', params: { stored: 99, supported: latestKernelSchemaVersion } });
    expect(sha256Of(file)).toBe(before);
    expect(existsSync(`${file}-wal`) ? statSync(`${file}-wal`).size : 0).toBe(0);
  });

  it('M1.1-E1 a new database is created private and migrated', () => {
    const file = temporaryDatabaseFile();
    const connection = openKernelDatabase(file, betterSqlite3Driver, ulids.next());
    expect(modeOf(file)).toBe(0o600);
    expect(rows(connection, 'SELECT owner, version FROM schema_versions')).toEqual([{ owner: 'kernel', version: latestKernelSchemaVersion }]);
    connection.close();
  });

  it('M1.1-E2 the pragmas are set and the WAL file is private', () => {
    const file = temporaryDatabaseFile();
    const connection = openKernelDatabase(file, betterSqlite3Driver, ulids.next());
    expect(connection.pragma('journal_mode')).toBe('wal');
    expect(connection.pragma('synchronous')).toBe(2);
    expect(connection.pragma('foreign_keys')).toBe(1);
    expect(connection.pragma('busy_timeout')).toBe(5000);
    connection.exec("INSERT INTO kernel_settings (key, value, revision, updated_at) VALUES ('probe', '1', 1, 0)");
    expect(existsSync(`${file}-wal`)).toBe(true);
    expect(modeOf(`${file}-wal`)).toBe(0o600);
    connection.close();
  });

  it('M1.1-E3 every kernel table and the unique indexes exist', () => {
    const connection = openKernelDatabase(temporaryDatabaseFile(), betterSqlite3Driver, ulids.next());
    const tables = rows(connection, "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").map((row) => row['name']);
    expect(tables).toEqual(kernelTables);
    const indexes = rows(connection, "SELECT name FROM sqlite_master WHERE type = 'index' AND sql LIKE 'CREATE UNIQUE%' ORDER BY name").map((row) => row['name']);
    expect(indexes).toEqual(['messages_idem', 'notifications_key']);
    connection.close();
  });

  it('M1.1-E4 reopening at the current version keeps the data', () => {
    const file = temporaryDatabaseFile();
    const first = openKernelDatabase(file, betterSqlite3Driver, ulids.next());
    first.exec("INSERT INTO kernel_settings (key, value, revision, updated_at) VALUES ('kvman.version', '\"2.0.0\"', 1, 0)");
    first.close();
    const second = openKernelDatabase(file, betterSqlite3Driver, ulids.next());
    expect(rows(second, 'SELECT key FROM kernel_settings')).toEqual([{ key: 'kvman.version' }]);
    expect(rows(second, 'SELECT version FROM schema_versions')).toEqual([{ version: latestKernelSchemaVersion }]);
    second.close();
  });

  it('M1.1-E5 a read-only connection reads committed data and cannot write', () => {
    const file = temporaryDatabaseFile();
    const writer = openKernelDatabase(file, betterSqlite3Driver, ulids.next());
    writer.exec("INSERT INTO kernel_settings (key, value, revision, updated_at) VALUES ('a', '1', 1, 0)");
    const reader = openReadConnection(file, betterSqlite3Driver);
    expect(rows(reader, 'SELECT key FROM kernel_settings')).toEqual([{ key: 'a' }]);
    expect(() => reader.exec("INSERT INTO kernel_settings (key, value, revision, updated_at) VALUES ('b', '1', 1, 0)")).toThrow(StorageFailure);
    reader.close();
    writer.close();
  });
});

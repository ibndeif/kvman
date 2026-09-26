import { describe, expect, it } from 'vitest';
import { betterSqlite3Driver, kernelMigrations, latestKernelSchemaVersion, openKernelDatabase } from '../../src/index.ts';
import { rows, temporaryDatabaseFile, ulids } from './harness.ts';

function columnsOf(table: string, file: string): unknown[] {
  const connection = openKernelDatabase(file, betterSqlite3Driver, ulids.next());
  const names = rows(connection, `SELECT name FROM pragma_table_info('${table}')`).map((row) => row['name']);
  connection.close();
  return names;
}

describe('kernel schema 2 (ADR 0070)', () => {
  it('M1.6-E40 a database at schema 1 migrates to the latest schema, and a new one starts there', () => {
    const file = temporaryDatabaseFile();
    const versionOne = kernelMigrations.find((migration) => migration.version === 1);
    if (versionOne === undefined) throw new Error('no migration to version 1');
    const direct = betterSqlite3Driver.open(file, { readonly: false, fileMustExist: false });
    for (const statement of versionOne.statements) direct.exec(statement);
    direct.exec("INSERT INTO schema_versions (owner, version) VALUES ('kernel', 1)");
    direct.close();

    const migrated = openKernelDatabase(file, betterSqlite3Driver, ulids.next());
    expect(rows(migrated, "SELECT version FROM schema_versions WHERE owner = 'kernel'")).toEqual([{ version: latestKernelSchemaVersion }]);
    migrated.close();
    expect(columnsOf('messages', file)).toContain('on_abort');
    expect(columnsOf('recorded_values', file)).toEqual(['message_id', 'kind', 'n', 'value']);

    const fresh = temporaryDatabaseFile();
    expect(columnsOf('recorded_values', fresh)).toEqual(['message_id', 'kind', 'n', 'value']);
  });
});

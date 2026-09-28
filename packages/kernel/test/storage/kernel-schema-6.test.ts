import { describe, expect, it } from 'vitest';
import { betterSqlite3Driver, kernelMigrations, openKernelDatabase } from '../../src/index.ts';
import { rows, temporaryDatabaseFile, ulids } from './harness.ts';

describe('kernel schema 6 (ADR 0163)', () => {
  it('M2.12-E52 a database at schema 5 gains the tray and rate-count indexes, which the rate count uses', () => {
    const file = temporaryDatabaseFile();
    const direct = betterSqlite3Driver.open(file, { readonly: false, fileMustExist: false });
    for (const migration of kernelMigrations.filter((candidate) => candidate.version <= 5)) {
      for (const statement of migration.statements) direct.exec(statement);
    }
    direct.exec("INSERT INTO schema_versions (owner, version) VALUES ('kernel', 5)");
    direct.close();
    const connection = openKernelDatabase(file, betterSqlite3Driver, ulids.next());
    expect(rows(connection, "SELECT version FROM schema_versions WHERE owner = 'kernel'")).toEqual([{ version: 6 }]);
    expect(rows(connection, "SELECT name, tbl_name FROM sqlite_master WHERE type = 'index' AND name IN ('notifications_ws', 'messages_ui') ORDER BY name")).toEqual([
      { name: 'messages_ui', tbl_name: 'messages' }, { name: 'notifications_ws', tbl_name: 'notifications' },
    ]);
    const plan = connection
      .prepare(`EXPLAIN QUERY PLAN SELECT COUNT(*) AS sent FROM messages WHERE type IN ('ui.toast', 'ui.notify') AND type = ? AND source = ?
        AND workspace_id IS ? AND created_at > ?`)
      .all('ui.notify', 'ext:@acme/herald', null, 0);
    expect(plan.map((step) => String(step['detail'])).join(' ')).toContain('messages_ui');
    connection.close();
  });
});

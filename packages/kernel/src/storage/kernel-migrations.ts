import type { Connection } from './driver.ts';
import { kernelSchemaVersion1, kernelSchemaVersion2, kernelSchemaVersion3, kernelSchemaVersion4 } from './kernel-schema.ts';

export type KernelMigration = { version: number; statements: readonly string[] };

export const kernelMigrations: readonly KernelMigration[] = [
  { version: 1, statements: kernelSchemaVersion1 },
  { version: 2, statements: kernelSchemaVersion2 },
  { version: 3, statements: kernelSchemaVersion3 },
  { version: 4, statements: kernelSchemaVersion4 },
];

export const latestKernelSchemaVersion = kernelMigrations.length;

const kernelOwner = 'kernel';

export function readKernelSchemaVersion(connection: Connection): number {
  const table = connection.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_versions'").get();
  if (table === undefined) return 0;
  const row = connection.prepare('SELECT version FROM schema_versions WHERE owner = ?').get(kernelOwner);
  return row === undefined ? 0 : Number(row['version']);
}

export function migrateKernelSchema(connection: Connection): void {
  const current = readKernelSchemaVersion(connection);
  const pending = kernelMigrations.filter((migration) => migration.version > current);
  if (pending.length === 0) return;
  connection.exec('BEGIN IMMEDIATE');
  try {
    for (const migration of pending) {
      for (const statement of migration.statements) connection.exec(statement);
    }
    connection
      .prepare('INSERT INTO schema_versions (owner, version) VALUES (?, ?) ON CONFLICT(owner) DO UPDATE SET version = excluded.version')
      .run(kernelOwner, latestKernelSchemaVersion);
    connection.exec('COMMIT');
  } catch (error) {
    connection.exec('ROLLBACK');
    throw error;
  }
}

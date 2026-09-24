import { chmodSync, existsSync, writeFileSync } from 'node:fs';
import { kernelProblem, ProblemError } from '../problems.ts';
import type { Connection, StorageDriver } from './driver.ts';
import { latestKernelSchemaVersion, migrateKernelSchema, readKernelSchemaVersion } from './kernel-migrations.ts';

export const busyTimeoutMs = 5000;

const privateFileMode = 0o600;

function refuseNewerSchema(file: string, driver: StorageDriver, correlationId: string): void {
  const reader = driver.open(file, { readonly: true, fileMustExist: true });
  try {
    const stored = readKernelSchemaVersion(reader);
    if (stored > latestKernelSchemaVersion) {
      throw new ProblemError(kernelProblem('SCHEMA_TOO_NEW', {
        correlationId,
        detail: `the database is at kernel schema ${stored}; this kvman knows up to ${latestKernelSchemaVersion}`,
        hint: 'run a newer kvman with this home folder',
        params: { stored, supported: latestKernelSchemaVersion },
      }));
    }
  } finally {
    reader.close();
  }
}

export function applyConnectionPragmas(connection: Connection): void {
  connection.pragma(`busy_timeout = ${busyTimeoutMs}`);
  connection.pragma('foreign_keys = ON');
}

export function openKernelDatabase(file: string, driver: StorageDriver, correlationId: string): Connection {
  if (existsSync(file)) refuseNewerSchema(file, driver, correlationId);
  else writeFileSync(file, '', { mode: privateFileMode, flag: 'wx' });
  chmodSync(file, privateFileMode);
  const connection = driver.open(file, { readonly: false, fileMustExist: true });
  try {
    connection.pragma('journal_mode = WAL');
    connection.pragma('synchronous = FULL');
    applyConnectionPragmas(connection);
    migrateKernelSchema(connection);
    return connection;
  } catch (error) {
    connection.close();
    throw error;
  }
}

export function openReadConnection(file: string, driver: StorageDriver): Connection {
  const connection = driver.open(file, { readonly: true, fileMustExist: true });
  connection.pragma(`busy_timeout = ${busyTimeoutMs}`);
  connection.pragma('query_only = ON');
  return connection;
}

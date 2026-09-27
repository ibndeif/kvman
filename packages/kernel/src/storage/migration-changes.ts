import type { ConfigChanged, Json, JsonObject, MigratingRecord, MigrationConfigWrite, MigrationWrite } from '@kvman/protocol';
import { storedConfigIssues } from '../config/stored-config.ts';
import { kernelProblem } from '../problems.ts';
import { readConfigRow } from './config-rows.ts';
import { applyStoreWrite } from './store-writes.ts';
import { publishKernelEvent, UnitRejected, type UnitScope } from './unit-contents.ts';

export type Migrating = MigratingRecord;

// What a step may write: the target version's collections and logs (a family as `history:*`), and, on the last step,
// the config schema every stored value is checked against (ADR 0143).
export type StepData = { collections: readonly string[]; logs: readonly string[] };
export type StoredConfigCheck = { schema: JsonObject | undefined };

export type MigrationChange =
  | { kind: 'migration.begin'; name: string; migrating: Migrating }
  | { kind: 'migration.step'; name: string; to: number; writes: readonly MigrationWrite[]; config: readonly MigrationConfigWrite[]; data: StepData; check?: StoredConfigCheck }
  | { kind: 'migration.end'; name: string };

function rejected(scope: UnitScope, detail: string): UnitRejected {
  return new UnitRejected(kernelProblem('VALIDATION_FAILED', { correlationId: scope.correlationId, detail }));
}

function checkWorkspace(scope: UnitScope, workspaceId: string | null | undefined): void {
  if (workspaceId === null || workspaceId === undefined) return;
  if (scope.connection.prepare('SELECT 1 AS found FROM workspaces WHERE id = ?').get(workspaceId) === undefined) throw rejected(scope, `no workspace ${workspaceId} exists`);
}

function logRegistered(data: StepData, log: string): boolean {
  return data.logs.some((prefix) => (prefix.endsWith(':*') ? log.startsWith(prefix.slice(0, -1)) && log.length > prefix.length - 1 : log === prefix));
}

function applyWrite(scope: UnitScope, name: string, data: StepData, write: MigrationWrite): void {
  checkWorkspace(scope, write.workspaceId);
  const owner = { owner: name, workspaceId: write.workspaceId ?? undefined };
  const storeScope = write.workspaceId === null ? 'global' : 'workspace';
  const ws = write.workspaceId ?? '';
  switch (write.kind) {
    case 'kv.set':
      return applyStoreWrite(scope.connection, owner, { kind: 'kv.set', scope: storeScope, key: write.key, value: write.value }, scope.now);
    case 'kv.delete':
      return applyStoreWrite(scope.connection, owner, { kind: 'kv.delete', scope: storeScope, key: write.key }, scope.now);
    case 'doc.put':
    case 'doc.delete':
      if (!data.collections.includes(write.collection)) throw rejected(scope, `${name} registers no collection "${write.collection}"`);
      return applyStoreWrite(scope.connection, owner, write.kind === 'doc.put'
        ? { kind: 'doc.put', scope: storeScope, collection: write.collection, id: write.id, data: write.data }
        : { kind: 'doc.delete', scope: storeScope, collection: write.collection, id: write.id }, scope.now);
    case 'log.set':
    case 'log.delete':
      if (!logRegistered(data, write.log)) throw rejected(scope, `${name} registers no log "${write.log}"`);
      if (write.kind === 'log.set') {
        scope.connection.prepare('UPDATE logs SET data = ? WHERE owner = ? AND ws = ? AND log = ? AND seq = ?').run(JSON.stringify(write.value), name, ws, write.log, write.seq);
      } else {
        scope.connection.prepare('DELETE FROM logs WHERE owner = ? AND ws = ? AND log = ? AND seq = ?').run(name, ws, write.log, write.seq);
      }
      return undefined;
  }
}

// A migration's config write replaces the stored value with the next revision; the target schema checks it on the last
// step, not here (ADR 0143).
function applyConfig(scope: UnitScope, name: string, write: MigrationConfigWrite): void {
  const workspaceId = write.scope === 'global' ? undefined : write.workspaceId;
  if (write.scope === 'workspace' && workspaceId === undefined) throw rejected(scope, 'a workspace config value needs a workspace id');
  checkWorkspace(scope, workspaceId);
  const revision = readConfigRow(scope.connection, name, workspaceId).revision + 1;
  const value = JSON.stringify(write.value);
  if (workspaceId === undefined) {
    scope.connection.prepare(`INSERT INTO global_config (extension, value, revision) VALUES (?, ?, ?)
      ON CONFLICT(extension) DO UPDATE SET value = excluded.value, revision = excluded.revision`).run(name, value, revision);
  } else {
    scope.connection.prepare(`INSERT INTO workspace_config (workspace_id, extension, value, revision, updated_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(workspace_id, extension) DO UPDATE SET value = excluded.value, revision = excluded.revision, updated_at = excluded.updated_at`)
      .run(workspaceId, name, value, revision, scope.now);
  }
  const payload: ConfigChanged = { extension: name, scope: write.scope, ...(workspaceId === undefined ? {} : { workspaceId }), revision };
  publishKernelEvent(scope, workspaceId, { type: 'kernel.config.changed', payload });
}

export function writeDataVersion(scope: UnitScope, name: string, version: number): void {
  scope.connection.prepare('INSERT INTO schema_versions (owner, version) VALUES (?, ?) ON CONFLICT(owner) DO UPDATE SET version = excluded.version').run(name, version);
}

export function setMigrating(scope: UnitScope, name: string, migrating: Migrating | undefined): void {
  scope.connection.prepare('UPDATE extensions SET migrating = ? WHERE name = ?').run(migrating === undefined ? null : JSON.stringify(migrating), name);
}

// 04 §4.8: each step's writes, config writes, and stored version commit together; the last step also checks every
// stored config value against the target schema, so a failing check discards it like a failing step (ADR 0143).
function step(scope: UnitScope, change: Extract<MigrationChange, { kind: 'migration.step' }>): Json {
  for (const write of change.writes) applyWrite(scope, change.name, change.data, write);
  for (const write of change.config) applyConfig(scope, change.name, write);
  writeDataVersion(scope, change.name, change.to);
  if (change.check !== undefined) {
    const issues = storedConfigIssues(scope.connection, change.name, change.check.schema);
    const [first] = issues;
    if (first !== undefined) {
      throw new UnitRejected(kernelProblem('CONFIG_INVALID', { correlationId: scope.correlationId, detail: `${first.path}: ${first.message}`, issues, hint: 'a migration step must fix the stored config' }));
    }
  }
  return { version: change.to };
}

export function applyMigrationChange(scope: UnitScope, change: MigrationChange): Json {
  if (change.kind === 'migration.step') return step(scope, change);
  setMigrating(scope, change.name, change.kind === 'migration.begin' ? change.migrating : undefined);
  return {};
}

import type { Capabilities, Message, Problem } from '@kvman/protocol';
import type { SnapshotStore } from '../install/snapshot-store.ts';
import { configProblem, covers, storedDataVersion, type DataMigrations } from '../migrations/data-migrations.ts';
import type { RegistryState } from '../registry/registry-state.ts';
import type { Connection } from '../storage/driver.ts';
import { refusal } from './command-payloads.ts';
import { mostIsolated } from './reload-checks.ts';

export type EnableDataDeps = {
  connection: Connection;
  registry: RegistryState;
  snapshots: SnapshotStore;
  migrations: DataMigrations;
};

export type EnableDataResult = { ok: true; version: number } | { ok: false; problem: Problem };

// 04 §4.8, ADRs 0142, 0143: before the enable commits, data older than the code is migrated with it (and every
// stored config value checked in the last step); newer data it does not cover refuses the enable.
export async function prepareEnableData(
  deps: EnableDataDeps,
  message: Message,
  name: string,
  digest: string,
  grants: Capabilities,
): Promise<EnableDataResult> {
  const manifest = deps.registry.current().manifestOf(name);
  const snapshot = await deps.snapshots.verifyDigest(name, digest);
  if (manifest === undefined || snapshot === undefined) return { ok: false, problem: refusal(message, 'NOT_FOUND', { detail: `no verified version of ${name} is installed` }) };
  const code = manifest.data.version;
  const stored = storedDataVersion(deps.connection, name);
  if (stored !== undefined && stored > code && !covers(manifest, stored)) {
    return { ok: false, problem: refusal(message, 'SCHEMA_TOO_NEW', { detail: `the stored data of ${name} is at version ${stored}, newer than its code's ${code}`, params: { stored, supported: code } }) };
  }
  if (stored === undefined || stored >= code) {
    const problem = configProblem(deps.connection, name, manifest, message.correlationId);
    return problem === undefined ? { ok: true, version: code } : { ok: false, problem };
  }
  const others = [...deps.registry.enabled()].flatMap(([workspaceId, names]) => (names.includes(name) ? [deps.registry.capabilities(name, workspaceId)] : []));
  const outcome = await deps.migrations.migrate({
    extension: name, target: { digest, manifest, snapshot }, active: manifest, isolation: mostIsolated([grants, ...others.filter((grant) => grant !== undefined)]),
    migrating: { digest }, resume: false, correlationId: message.correlationId,
  });
  return outcome.ok ? { ok: true, version: code } : { ok: false, problem: outcome.problem };
}

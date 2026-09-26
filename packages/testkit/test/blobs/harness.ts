import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { Isolation, Json } from '@kvman/protocol';
import type { ExtensionDefinition } from '@kvman/sdk';
import { expect } from 'vitest';
import { workspaceA } from '../hosts/harness.ts';
import { installFixture } from '../install/fixture-snapshots.ts';
import { openInstallFixture, type InstallFixture } from '../install/harness.ts';
import { grantsOf, rows, run, valueOf } from '../workspaces/harness.ts';
import holder from './fixtures/extensions/holder.ts';
import keeper from './fixtures/extensions/keeper.ts';

// Runtimes with sandboxed hosts and a real home folder, where blobs are files.
export const blobTests = { timeout: 60_000 } as const;

const folder = fileURLToPath(new URL('./fixtures/extensions/', import.meta.url));

const fixtures: Array<{ definition: ExtensionDefinition; entry: string }> = [{ definition: keeper, entry: 'keeper.ts' }, { definition: holder, entry: 'holder.ts' }];

export type BlobInfo = { blobId: string; size: number; mime: string; name?: string };

// Keeper and Holder installed and enabled in A with their own grants.
export async function openBlobFixture(isolation: Isolation = 'sandboxed'): Promise<InstallFixture> {
  const fixture = await openInstallFixture();
  for (const { definition, entry } of fixtures) await installFixture(fixture.connection, fixture.home, { definition, folder, entry });
  fixture.runtime.registry.refresh();
  for (const name of ['@acme/keeper', '@acme/holder']) fixture.enable(workspaceA, name, grantsOf(fixture, name, isolation));
  return fixture;
}

export function sha256(text: string | Buffer): string {
  return createHash('sha256').update(text).digest('hex');
}

function isInfo(value: Json): value is BlobInfo & Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && typeof value['blobId'] === 'string';
}

// What `keeper.put` or `holder.make` answered: the stored blob.
export function infoOf(value: Json): BlobInfo {
  const inner = typeof value === 'object' && value !== null && !Array.isArray(value) && 'value' in value ? value['value'] ?? null : value;
  if (!isInfo(inner)) throw new Error(`expected a blob, got ${JSON.stringify(value)}`);
  return inner;
}

export async function keeperPut(fixture: InstallFixture, payload: Json): Promise<BlobInfo> {
  return infoOf(valueOf(await run(fixture, 'keeper.put', payload)));
}

export async function holderMake(fixture: InstallFixture, text: string): Promise<BlobInfo> {
  return infoOf(valueOf(await run(fixture, 'holder.make', { text })));
}

export function refsOf(fixture: InstallFixture, blobId: string): Array<Record<string, unknown>> {
  return rows(fixture, 'SELECT owner, ws, ref, expires_at FROM blob_refs WHERE blob_id = ? ORDER BY owner, ref', blobId);
}

export function kvOf(fixture: InstallFixture, owner: string, key: string): unknown {
  const [row] = rows(fixture, 'SELECT value FROM kv WHERE owner = ? AND key = ?', owner, key);
  return row === undefined ? undefined : JSON.parse(String(row['value']));
}

// Invariant 9 (14 §14.3): every committed reference names a row whose file exists.
export function expectNoDanglingRefs(fixture: InstallFixture): void {
  const dangling = rows(fixture, 'SELECT DISTINCT blob_id FROM blob_refs').map((row) => String(row['blob_id']))
    .filter((blobId) => rows(fixture, 'SELECT id FROM blobs WHERE id = ?', blobId).length === 0 || !fixture.runtime.files.files.exists(blobId));
  expect(dangling).toEqual([]);
}

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { BlobInfo } from '@kvman/protocol';
import { betterSqlite3Driver, BlobFiles, BlobStore, inertFaults, openKernelDatabase, type BlobHolder, type Connection } from '../../src/index.ts';
import { temporaryDatabaseFile, ulids } from '../storage/harness.ts';

export const hour = 3_600_000;

export type BlobFixture = { connection: Connection; files: BlobFiles; store: BlobStore; clock: { now: number } };

export function openBlobFixture(): BlobFixture {
  const connection = openKernelDatabase(temporaryDatabaseFile(), betterSqlite3Driver, ulids.next());
  const files = new BlobFiles(mkdtempSync(path.join(tmpdir(), 'kvman-blob-store-')));
  const clock = { now: 1_790_000_000_000 };
  return { connection, files, clock, store: new BlobStore({ connection, files, now: () => clock.now, faults: inertFaults }) };
}

export const kept = (owner = '@acme/keeper'): BlobHolder => ({ owner, ws: '', ref: 'blob:x', expiresAt: null });

export async function putBytes(fixture: BlobFixture, text: string, holder: BlobHolder = kept()): Promise<BlobInfo> {
  const intake = await fixture.store.intake();
  await intake.write(Buffer.from(text, 'utf8'));
  return fixture.store.register(await intake.finish(), { mime: 'text/plain' }, holder);
}

export function releaseAll(fixture: BlobFixture, blobId: string): void {
  fixture.connection.prepare('DELETE FROM blob_refs WHERE blob_id = ?').run(blobId);
}

export function blobRow(fixture: BlobFixture, blobId: string): boolean {
  return fixture.connection.prepare('SELECT 1 AS found FROM blobs WHERE id = ?').get(blobId) !== undefined;
}

// Invariant 9 (14 §14.3): every reference names a row whose file exists.
export function danglingRefs(fixture: BlobFixture): string[] {
  return fixture.connection
    .prepare('SELECT DISTINCT blob_id FROM blob_refs')
    .all()
    .map((row) => String(row['blob_id']))
    .filter((blobId) => !blobRow(fixture, blobId) || !fixture.files.exists(blobId));
}

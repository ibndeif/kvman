import type { BlobInfo, BlobStat } from '@kvman/protocol';
import type { Connection } from '../storage/driver.ts';

// 04 §4.6, ADRs 0134 and 0135: how long references and unreferenced blobs last.
export const blobLifetimes = { pendingGraceMs: 3_600_000, uploadMs: 24 * 3_600_000, unreferencedMs: 3_600_000 } as const;

// The refs a blob is held by: an extension's own (`blob:<id>`), a running handler's put (`pending:<messageId>`), a
// person's upload (`upload`), and the kernel's spills (`payload:`, `result:`, `event:` and the row's id).
export const blobRefNames = {
  kept: (blobId: string) => `blob:${blobId}`,
  pending: (messageId: string) => `pending:${messageId}`,
  upload: 'upload',
} as const;

export type BlobHolder = { owner: string; ws: string; ref: string; expiresAt: number | null };

export function readBlobStat(connection: Connection, blobId: string): BlobStat | undefined {
  const row = connection.prepare('SELECT size, mime, name FROM blobs WHERE id = ?').get(blobId);
  if (row === undefined) return undefined;
  const name = row['name'];
  return { size: Number(row['size']), mime: String(row['mime']), ...(name === null || name === undefined ? {} : { name: String(name) }) };
}

// ADR 0134: the first put of these bytes names them; later puts answer what is stored.
export function insertBlob(connection: Connection, blob: BlobInfo, now: number): BlobInfo {
  connection
    .prepare('INSERT OR IGNORE INTO blobs (id, size, mime, name, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(blob.blobId, blob.size, blob.mime, blob.name ?? null, now);
  const stored = readBlobStat(connection, blob.blobId);
  return stored === undefined ? blob : { blobId: blob.blobId, ...stored };
}

export function addBlobRef(connection: Connection, blobId: string, holder: BlobHolder): void {
  connection
    .prepare('INSERT OR IGNORE INTO blob_refs (blob_id, owner, ws, ref, expires_at) VALUES (?, ?, ?, ?, ?)')
    .run(blobId, holder.owner, holder.ws, holder.ref, holder.expiresAt);
}

export function removeBlobRef(connection: Connection, blobId: string, owner: string, ws: string, ref: string): void {
  connection.prepare('DELETE FROM blob_refs WHERE blob_id = ? AND owner = ? AND ws = ? AND ref = ?').run(blobId, owner, ws, ref);
}

// ADR 0134: a live reference in any scope, a pending one included.
export function holdsBlob(connection: Connection, owner: string, blobId: string, now: number): boolean {
  const row = connection
    .prepare('SELECT 1 AS held FROM blob_refs WHERE owner = ? AND blob_id = ? AND (expires_at IS NULL OR expires_at > ?) LIMIT 1')
    .get(owner, blobId, now);
  return row !== undefined;
}

export function blobExists(connection: Connection, blobId: string): boolean {
  return connection.prepare('SELECT 1 AS found FROM blobs WHERE id = ?').get(blobId) !== undefined;
}

// 04 §4.6: at commit a handler's pending references become its own; an attempt that does not commit drops them.
export function settlePendingRefs(connection: Connection, messageId: string, committed: boolean): void {
  const pending = blobRefNames.pending(messageId);
  if (committed) {
    connection
      .prepare(`INSERT OR IGNORE INTO blob_refs (blob_id, owner, ws, ref, expires_at)
        SELECT blob_id, owner, ws, 'blob:' || blob_id, NULL FROM blob_refs WHERE ref = ?`)
      .run(pending);
  }
  connection.prepare('DELETE FROM blob_refs WHERE ref = ?').run(pending);
}

export function deleteExpiredRefs(connection: Connection, now: number): number {
  return connection.prepare('DELETE FROM blob_refs WHERE expires_at IS NOT NULL AND expires_at <= ?').run(now).changes;
}

// Blobs nothing references that are old enough to collect, a bounded batch at a time.
export function collectableBlobs(connection: Connection, now: number, limit: number): string[] {
  return connection
    .prepare(`SELECT id FROM blobs WHERE created_at <= ?
      AND NOT EXISTS (SELECT 1 FROM blob_refs WHERE blob_refs.blob_id = blobs.id) ORDER BY created_at LIMIT ?`)
    .all(now - blobLifetimes.unreferencedMs, limit)
    .map((row) => String(row['id']));
}

export function deleteBlobRows(connection: Connection, blobIds: readonly string[]): void {
  const remove = connection.prepare('DELETE FROM blobs WHERE id = ?');
  for (const blobId of blobIds) remove.run(blobId);
}

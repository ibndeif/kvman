import { blobLimits } from '@kvman/protocol';
import { addBlobRef, insertBlob } from '../blobs/blob-rows.ts';
import { StorageFailure, type Connection, type SqlValue } from './driver.ts';

// Where spilled JSON lives: content-addressed blob files (04 §4.6), written and read inside the synchronous commit.
export interface SpillFiles {
  storeSync(bytes: Uint8Array): string;
  readSync(blobId: string): Buffer;
}

export type RowWriter = { connection: Connection; files: SpillFiles; now: number };

export type StoredJson = { inline: string | null; ref: string | null };

// ADR 0135: kernel-owned references, named after the row that holds them and deleted with it.
export const spillRefs = {
  payload: (messageId: string) => `payload:${messageId}`,
  result: (messageId: string) => `result:${messageId}`,
  event: (eventId: string) => `event:${eventId}`,
} as const;

// JSON over 256 KB is written as a blob, and the row stores the blob's id instead (02 §2.2, ADR 0135).
export function spillJson(rows: RowWriter, value: unknown, holder: { ws: string | undefined; ref: string }): StoredJson {
  const json = JSON.stringify(value);
  const bytes = Buffer.from(json, 'utf8');
  if (bytes.byteLength <= blobLimits.inlineBytes) return { inline: json, ref: null };
  const blobId = rows.files.storeSync(bytes);
  insertBlob(rows.connection, { blobId, size: bytes.byteLength, mime: 'application/json' }, rows.now);
  addBlobRef(rows.connection, blobId, { owner: 'kernel', ws: holder.ws ?? '', ref: holder.ref, expiresAt: null });
  return { inline: null, ref: blobId };
}

// The JSON text of a column pair: inline, or read back from its blob.
export function storedJsonText(files: SpillFiles, inline: SqlValue | undefined, ref: SqlValue | undefined): string | undefined {
  if (inline !== null && inline !== undefined) return String(inline);
  if (ref === null || ref === undefined) return undefined;
  try {
    return files.readSync(String(ref)).toString('utf8');
  } catch (error) {
    throw new StorageFailure('corrupt', `the spilled blob ${String(ref)} cannot be read: ${error instanceof Error ? error.message : String(error)}`);
  }
}

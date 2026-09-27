import { createReadStream, type ReadStream } from 'node:fs';
import { open } from 'node:fs/promises';
import type { BlobInfo, BlobStat } from '@kvman/protocol';
import type { FaultPoints } from '../faults/fault-points.ts';
import type { Connection } from '../storage/driver.ts';
import { inWriteTransaction } from '../storage/write-transaction.ts';
import type { BlobFiles } from './blob-files.ts';
import { BlobIntake, type TakenBlob } from './blob-intake.ts';
import { addBlobRef, collectableBlobs, deleteBlobRows, deleteExpiredRefs, insertBlob, readBlobStat, settlePendingRefs, type BlobHolder } from './blob-rows.ts';

export type BlobStoreOptions = { connection: Connection; files: BlobFiles; now: () => number; faults: FaultPoints };

export type BlobMeta = { mime: string; name?: string };

// GC deletes at most this many blobs in one synchronous step, so the main thread never blocks for long.
export const collectBatch = 500;

// 04 §4.6: the kernel's blob store. A put registers and GC collects in uninterrupted synchronous steps on the main
// thread (the single writer), so a put never links to a file GC is deleting, and a blob with a pending reference is
// never collected however long its handler runs.
export class BlobStore {
  readonly #options: BlobStoreOptions;

  constructor(options: BlobStoreOptions) {
    this.#options = options;
  }

  get files(): BlobFiles {
    return this.#options.files;
  }

  intake(maxBytes?: number): Promise<BlobIntake> {
    return BlobIntake.open(this.#options.files, maxBytes);
  }

  // One synchronous step: the file is placed (or dropped as a duplicate), then the row and the reference commit.
  register(taken: TakenBlob, meta: BlobMeta, holder: BlobHolder): BlobInfo {
    const { connection, files, now, faults } = this.#options;
    files.adopt(taken.temporary, taken.blobId);
    faults.reach('blob.put.after-file-before-ref');
    let info: BlobInfo = { blobId: taken.blobId, size: taken.size, mime: meta.mime, ...(meta.name === undefined ? {} : { name: meta.name }) };
    inWriteTransaction(connection, () => {
      info = insertBlob(connection, info, now());
      addBlobRef(connection, taken.blobId, holder);
    });
    return info;
  }

  // 04 §4.6: an attempt that ends without committing drops the references its puts made.
  dropPending(messageId: string): void {
    const { connection } = this.#options;
    inWriteTransaction(connection, () => settlePendingRefs(connection, messageId, false));
  }

  stat(blobId: string): BlobStat | undefined {
    return readBlobStat(this.#options.connection, blobId);
  }

  async read(blobId: string, offset: number, length: number): Promise<Buffer> {
    const handle = await open(this.#options.files.pathOf(blobId), 'r');
    try {
      const buffer = Buffer.alloc(length);
      const { bytesRead } = await handle.read(buffer, 0, length, offset);
      return buffer.subarray(0, bytesRead);
    } finally {
      await handle.close();
    }
  }

  stream(blobId: string): ReadStream {
    return createReadStream(this.#options.files.pathOf(blobId));
  }

  // One GC step: expired references go, then up to a batch of unreferenced blobs older than 1 h, rows and files.
  // Returns how many blobs it deleted, so a caller runs steps until one deletes fewer than a batch.
  collect(): number {
    const { connection, files, now } = this.#options;
    let collected: string[] = [];
    inWriteTransaction(connection, () => {
      deleteExpiredRefs(connection, now());
      collected = collectableBlobs(connection, now(), collectBatch);
      deleteBlobRows(connection, collected);
    });
    for (const blobId of collected) files.remove(blobId);
    return collected.length;
  }
}

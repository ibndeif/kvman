import { createHash, type Hash } from 'node:crypto';
import { open, rm, type FileHandle } from 'node:fs/promises';
import { blobLimits } from '@kvman/protocol';
import type { BlobFiles } from './blob-files.ts';

export class BlobTooLarge extends Error {
  constructor(maxBytes: number) {
    super(`a blob holds at most ${maxBytes} bytes`);
    this.name = 'BlobTooLarge';
  }
}

export type TakenBlob = { temporary: string; blobId: string; size: number };

// 04 §4.6: the bytes of a put go to a temporary file and are hashed as they arrive; nothing names them until the
// put registers. Over 100 MB the file is dropped at once (ADR 0134); a process log may pass that by its marker line.
export class BlobIntake {
  readonly #handle: FileHandle;
  readonly #hash: Hash = createHash('sha256');
  readonly #maxBytes: number;
  readonly temporary: string;
  #size = 0;
  #closed = false;

  private constructor(handle: FileHandle, temporary: string, maxBytes: number) {
    this.#handle = handle;
    this.temporary = temporary;
    this.#maxBytes = maxBytes;
  }

  static async open(files: BlobFiles, maxBytes: number = blobLimits.putBytes): Promise<BlobIntake> {
    const temporary = files.temporaryPath();
    return new BlobIntake(await open(temporary, 'wx', 0o600), temporary, maxBytes);
  }

  // Its callers write one chunk at a time, each after the last one finished.
  async write(bytes: Uint8Array): Promise<void> {
    if (this.#size + bytes.byteLength > this.#maxBytes) throw new BlobTooLarge(this.#maxBytes);
    this.#size += bytes.byteLength;
    this.#hash.update(bytes);
    await this.#handle.write(bytes);
  }

  async finish(): Promise<TakenBlob> {
    await this.#handle.sync();
    this.#closed = true;
    await this.#handle.close();
    return { temporary: this.temporary, blobId: this.#hash.digest('hex'), size: this.#size };
  }

  // Dropping twice, or after a failed write, is the same as dropping once.
  async discard(): Promise<void> {
    if (!this.#closed) {
      this.#closed = true;
      await this.#handle.close();
    }
    await rm(this.temporary, { force: true });
  }
}

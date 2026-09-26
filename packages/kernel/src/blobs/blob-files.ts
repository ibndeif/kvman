import { createHash, randomUUID } from 'node:crypto';
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, rmSync, unlinkSync, writeSync } from 'node:fs';
import { dirname, join } from 'node:path';

// 04 §4.6: blobs/ab/cd/<sha256> under the home folder, and a temporary folder for bytes not yet named.
export class BlobFiles {
  readonly #root: string;
  readonly #temporary: string;

  constructor(home: string) {
    this.#root = join(home, 'blobs');
    this.#temporary = join(this.#root, 'tmp');
  }

  pathOf(blobId: string): string {
    return join(this.#root, blobId.slice(0, 2), blobId.slice(2, 4), blobId);
  }

  exists(blobId: string): boolean {
    return existsSync(this.pathOf(blobId));
  }

  temporaryPath(): string {
    mkdirSync(this.#temporary, { recursive: true, mode: 0o700 });
    return join(this.#temporary, randomUUID());
  }

  // A crash leaves temporary files that nothing names; boot removes them.
  clearTemporary(): void {
    rmSync(this.#temporary, { recursive: true, force: true });
  }

  temporaryFiles(): string[] {
    return existsSync(this.#temporary) ? readdirSync(this.#temporary) : [];
  }

  // Identical content is stored once: a temporary file whose content is already stored is dropped. The rename is
  // made durable before any row names the file, so a committed reference never points at a missing file.
  adopt(temporary: string, blobId: string): void {
    const target = this.pathOf(blobId);
    if (existsSync(target)) {
      unlinkSync(temporary);
      return;
    }
    mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
    renameSync(temporary, target);
    syncFolder(dirname(target));
  }

  // A spilled payload or result (ADR 0135), written inside the commit's transaction.
  storeSync(bytes: Uint8Array): string {
    const blobId = createHash('sha256').update(bytes).digest('hex');
    if (this.exists(blobId)) return blobId;
    const temporary = this.temporaryPath();
    const descriptor = openSync(temporary, 'wx', 0o600);
    try {
      writeSync(descriptor, bytes);
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
    this.adopt(temporary, blobId);
    return blobId;
  }

  readSync(blobId: string): Buffer {
    return readFileSync(this.pathOf(blobId));
  }

  remove(blobId: string): void {
    rmSync(this.pathOf(blobId), { force: true });
  }
}

function syncFolder(folder: string): void {
  const descriptor = openSync(folder, 'r');
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

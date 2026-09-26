import { join } from 'node:path';
import type { TrustedFile, WorkspaceTrust } from '@kvman/protocol';
import { hashFile, scanGatedFolder, TrustTooLarge, UntrustableEntry, type ScannedFile } from './trust-scan.ts';

type KnownFile = ScannedFile & { sha256: string };

export type GateFolder = { id: string; path: string };

// 07 §7.2, ADR 0137: the trust gate's view of <ws>/.kvman/. Each file's hash is kept with its size, modification
// time, and inode, so a check lists the folder and rehashes only files whose stat changed; after a restart the first
// check rehashes every file once.
export class TrustGate {
  readonly #known = new Map<string, Map<string, KnownFile>>();
  readonly #hash: (path: string) => Promise<string>;

  constructor(hash: (path: string) => Promise<string> = hashFile) {
    this.#hash = hash;
  }

  // Every regular file with its hash; a symlink or a folder over the caps is thrown as UntrustableEntry or
  // TrustTooLarge.
  async preview(folder: GateFolder): Promise<TrustedFile[]> {
    const scanned = await scanGatedFolder(folder.path);
    return Promise.all(scanned.map(async (file) => ({ path: file.path, sha256: await this.#hashOf(folder, file) })));
  }

  // Whether the files are exactly the trusted ones: none added, removed, changed, or turned into something else.
  async intact(folder: GateFolder, trust: WorkspaceTrust): Promise<boolean> {
    let scanned: ScannedFile[];
    try {
      scanned = await scanGatedFolder(folder.path);
    } catch (error) {
      if (error instanceof UntrustableEntry || error instanceof TrustTooLarge) return false;
      throw error;
    }
    if (scanned.length !== trust.files.length) return false;
    for (const [index, file] of scanned.entries()) {
      const trusted = trust.files[index];
      if (trusted === undefined || trusted.path !== file.path || trusted.sha256 !== (await this.#hashOf(folder, file))) return false;
    }
    return true;
  }

  forget(workspaceId: string): void {
    this.#known.delete(workspaceId);
  }

  async #hashOf(folder: GateFolder, file: ScannedFile): Promise<string> {
    const known = this.#known.get(folder.id) ?? new Map<string, KnownFile>();
    this.#known.set(folder.id, known);
    const cached = known.get(file.path);
    if (cached !== undefined && cached.size === file.size && cached.modifiedMs === file.modifiedMs && cached.inode === file.inode) return cached.sha256;
    const sha256 = await this.#hash(join(folder.path, file.path));
    known.set(file.path, { ...file, sha256 });
    return sha256;
  }
}

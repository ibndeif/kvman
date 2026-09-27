import { join } from 'node:path';
import { readPackageJson } from './package-checks.ts';
import { snapshotFolder, type InstallPaths } from './install-paths.ts';
import type { VerifiedSnapshot } from '../hosts/snapshot-gate.ts';
import { verifyTree } from './snapshot-files.ts';

// 06 §6.5: a snapshot is rehashed before its first load in a kernel process (and at boot for every enabled
// extension); once verified, its entry module is known for the rest of the process.
export class SnapshotStore {
  readonly #paths: InstallPaths;
  readonly #digestOf: (extension: string) => string | undefined;
  readonly #verified = new Map<string, VerifiedSnapshot>();

  constructor(paths: InstallPaths, digestOf: (extension: string) => string | undefined) {
    this.#paths = paths;
    this.#digestOf = digestOf;
  }

  // The extension's active snapshot, if this process has verified it.
  verifiedEntry(extension: string): VerifiedSnapshot | undefined {
    const digest = this.#digestOf(extension);
    return digest === undefined ? undefined : this.#verified.get(`${extension}@${digest}`);
  }

  async verify(extension: string): Promise<boolean> {
    const digest = this.#digestOf(extension);
    return digest !== undefined && (await this.verifyDigest(extension, digest)) !== undefined;
  }

  // Any installed digest of the extension, rehashed once per process: a reload's target (06 §6.6, ADR 0145).
  async verifyDigest(extension: string, digest: string): Promise<VerifiedSnapshot | undefined> {
    const key = `${extension}@${digest}`;
    const known = this.#verified.get(key);
    if (known !== undefined) return known;
    const folder = snapshotFolder(this.#paths, digest);
    if (!(await verifyTree(folder, digest))) return undefined;
    const packageFolder = join(folder, 'node_modules', extension);
    const { main } = await readPackageJson(packageFolder);
    if (main === undefined) return undefined;
    const verified = { folder, entry: join(packageFolder, main) };
    this.#verified.set(key, verified);
    return verified;
  }
}

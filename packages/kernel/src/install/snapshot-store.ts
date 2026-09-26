import { join } from 'node:path';
import { readPackageJson } from './package-checks.ts';
import { snapshotFolder, type InstallPaths } from './install-paths.ts';
import { verifyTree } from './snapshot-files.ts';

// 06 §6.5: a snapshot is rehashed before its first load in a kernel process (and at boot for every enabled
// extension); once verified, its entry module is known for the rest of the process.
export class SnapshotStore {
  readonly #paths: InstallPaths;
  readonly #digestOf: (extension: string) => string | undefined;
  readonly #verified = new Map<string, string>();

  constructor(paths: InstallPaths, digestOf: (extension: string) => string | undefined) {
    this.#paths = paths;
    this.#digestOf = digestOf;
  }

  // The entry module of the extension's active snapshot, if this process has verified it.
  verifiedEntry(extension: string): string | undefined {
    const digest = this.#digestOf(extension);
    return digest === undefined ? undefined : this.#verified.get(`${extension}@${digest}`);
  }

  async verify(extension: string): Promise<boolean> {
    const digest = this.#digestOf(extension);
    if (digest === undefined) return false;
    const key = `${extension}@${digest}`;
    if (this.#verified.has(key)) return true;
    const folder = snapshotFolder(this.#paths, digest);
    if (!(await verifyTree(folder, digest))) return false;
    const packageFolder = join(folder, 'node_modules', extension);
    const { main } = await readPackageJson(packageFolder);
    if (main === undefined) return false;
    this.#verified.set(key, join(packageFolder, main));
    return true;
  }
}

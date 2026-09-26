import { randomUUID } from 'node:crypto';
import { mkdir, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

// 01 §1.6: where installs happen and where snapshots live, and the folder of the builtin tarballs (ADR 0115).
export type InstallPaths = { staging: string; snapshots: string; builtin: string };

export function installPaths(home: string, builtin: string): InstallPaths {
  return { staging: join(home, 'extensions', 'staging'), snapshots: join(home, 'extensions', 'snapshots'), builtin };
}

export function snapshotFolder(paths: InstallPaths, digest: string): string {
  return join(paths.snapshots, digest);
}

// Staging trees: one per stage, deleted when the stage fails or its token expires, and all of them at boot (06 §6.2).
export class StagingArea {
  readonly #folder: string;

  constructor(folder: string) {
    this.#folder = folder;
  }

  async create(): Promise<string> {
    const tree = join(this.#folder, randomUUID());
    await mkdir(tree, { recursive: true, mode: 0o700 });
    return tree;
  }

  remove(tree: string): Promise<void> {
    return rm(tree, { recursive: true, force: true });
  }

  async clear(): Promise<void> {
    await mkdir(this.#folder, { recursive: true, mode: 0o700 });
    for (const entry of await readdir(this.#folder)) await rm(join(this.#folder, entry), { recursive: true, force: true });
  }
}

import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { z } from '@kvman/sdk';
import { bundledExtensionNames } from './bundled-extensions.ts';

// The installed dependencies of extension folders (plan 10, ADR 0080, 4 and 5): each `kvman.dependencies` entry is
// found in the first `node_modules/<name>` at or above the folder of the extension that declares it, and its own
// entries are followed in turn. A manifest that isn't an extension's declares nothing here; the kernel names what is
// wrong with it when it loads.

const manifestSchema = z.object({ name: z.string(), kvman: z.object({ dependencies: z.record(z.string(), z.string()).optional() }).loose() }).loose();

type Manifest = z.output<typeof manifestSchema>;

/** A dependency found installed: its package name and its real folder. */
export type InstalledDependency = { name: string; folder: string };

/** A declared dependency that no `node_modules` folder has. */
export type MissingDependency = { dependent: string; name: string };

function readManifest(folder: string): Manifest | undefined {
  const parsed = manifestSchema.safeParse(JSON.parse(readFileSync(path.join(folder, 'package.json'), 'utf8')));
  return parsed.success ? parsed.data : undefined;
}

function declaredNames(manifest: Manifest | undefined): string[] {
  return Object.keys(manifest?.kvman.dependencies ?? {});
}

/** The folder of `name` in the first `node_modules` at or above `from`, or `undefined` when none has it. */
export function findInstalled(name: string, from: string): string | undefined {
  let current = path.resolve(from);
  for (;;) {
    const candidate = path.join(current, 'node_modules', name);
    if (existsSync(path.join(candidate, 'package.json'))) return realpathSync(candidate);
    const parent = path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

/** The dependencies of `folders` that they don't include, found installed, and those that aren't installed. */
export function installedDependencies(folders: readonly string[]): { installed: InstalledDependency[]; missing: MissingDependency[] } {
  const queue = folders.map((folder) => ({ folder, manifest: readManifest(folder) }));
  const known = new Set(queue.flatMap(({ manifest }) => (manifest === undefined ? [] : [manifest.name])));
  const installed: InstalledDependency[] = [];
  const missing: MissingDependency[] = [];
  for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
    for (const name of declaredNames(next.manifest)) {
      if (known.has(name)) continue;
      known.add(name);
      const folder = findInstalled(name, next.folder);
      if (folder === undefined) {
        missing.push({ dependent: next.manifest?.name ?? next.folder, name });
        continue;
      }
      installed.push({ name, folder });
      queue.push({ folder, manifest: readManifest(folder) });
    }
  }
  return { installed, missing };
}

/** The bundled extensions that `folders` declare, and those that such an extension declares, read from an installed copy. */
export function bundledDependencies(folders: readonly string[]): string[] {
  const bundled = new Set<string>(bundledExtensionNames);
  const queue = folders.map((folder) => ({ folder, manifest: readManifest(folder) }));
  const found: string[] = [];
  for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
    for (const name of declaredNames(next.manifest)) {
      if (!bundled.has(name) || found.includes(name)) continue;
      found.push(name);
      const folder = findInstalled(name, next.folder);
      if (folder !== undefined) queue.push({ folder, manifest: readManifest(folder) });
    }
  }
  return found;
}

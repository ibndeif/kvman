import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { z } from '@kvman/sdk';

// The packages a scaffold installs, found as Node finds them from the monorepo's installed copies: each package's
// dependencies, optional dependencies, and the peers that are installed. kvman's own packages (`@kvman/*`) are packed
// apart, from their workspace folders; a package another platform needs isn't installed here and is left out (npm
// skips an optional dependency it can't fetch).

const manifestSchema = z
  .object({
    name: z.string(),
    version: z.string(),
    dependencies: z.record(z.string(), z.string()).optional(),
    optionalDependencies: z.record(z.string(), z.string()).optional(),
    peerDependencies: z.record(z.string(), z.string()).optional(),
  })
  .loose();

export type Manifest = z.infer<typeof manifestSchema>;

export function parseManifest(text: string): Manifest {
  return manifestSchema.parse(JSON.parse(text));
}

export function readManifest(folder: string): Manifest {
  return parseManifest(readFileSync(path.join(folder, 'package.json'), 'utf8'));
}

function resolveFrom(folder: string, name: string): string | undefined {
  for (let directory = folder; ; directory = path.dirname(directory)) {
    const candidate = path.join(directory, 'node_modules', name);
    if (existsSync(path.join(candidate, 'package.json'))) return realpathSync(candidate);
    if (path.dirname(directory) === directory) return undefined;
  }
}

/** The installed folders of every third-party package that `roots` (name, resolved from a folder) need. */
export function packageClosure(roots: readonly { name: string; from: string }[]): Map<string, string> {
  const found = new Map<string, string>();
  const visit = (folder: string): void => {
    const manifest = readManifest(folder);
    const key = `${manifest.name}@${manifest.version}`;
    if (found.has(key)) return;
    if (!manifest.name.startsWith('@kvman/')) found.set(key, folder);
    for (const name of Object.keys({ ...manifest.dependencies, ...manifest.optionalDependencies, ...manifest.peerDependencies })) {
      const child = resolveFrom(folder, name);
      if (child !== undefined) visit(child);
    }
  };
  for (const root of roots) {
    const folder = resolveFrom(root.from, root.name);
    if (folder === undefined) throw new Error(`${root.name} isn't installed from ${root.from}`);
    visit(folder);
  }
  return found;
}

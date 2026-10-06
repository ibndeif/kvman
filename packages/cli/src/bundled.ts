import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from '@kvman/sdk';

// What ships with kvman (plan 01 §1.4, ADR 0026): the bundled presets in the package's own `presets/`, and the bundled
// extensions, which are the package's dependencies that have a `kvman` field. Each is found as Node resolves any
// module, so the repository and an installed kvman take the same path.

const packageFolder = fileURLToPath(new URL('../', import.meta.url));

export const bundledPresetsFolder = path.join(packageFolder, 'presets');

const packageSchema = z.object({ dependencies: z.record(z.string(), z.string()).optional() });
const dependencySchema = z.object({ kvman: z.unknown().optional() });

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(file, 'utf8'));
}

export function bundledExtensions(folder: string = packageFolder): ReadonlyMap<string, string> {
  const manifestFile = path.join(folder, 'package.json');
  const resolveFromPackage = createRequire(manifestFile).resolve;
  const extensions = new Map<string, string>();
  for (const name of Object.keys(packageSchema.parse(readJson(manifestFile)).dependencies ?? {})) {
    const dependencyManifest = resolveFromPackage(`${name}/package.json`);
    if (dependencySchema.parse(readJson(dependencyManifest)).kvman === undefined) continue;
    extensions.set(name, path.dirname(dependencyManifest));
  }
  return extensions;
}

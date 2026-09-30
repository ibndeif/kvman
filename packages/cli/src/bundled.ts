import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from '@kvman/sdk';

// What ships with kvman (plan 01 §1.4): the bundled presets in `presets/`, and the bundled extensions in
// `extensions/*`, each named by its package.json. Both folders sit at the root, beside `packages/`.

const root = fileURLToPath(new URL('../../../', import.meta.url));

export const bundledPresetsFolder = path.join(root, 'presets');

const packageSchema = z.object({ name: z.string().min(1) });

export function bundledExtensions(folder: string = path.join(root, 'extensions')): ReadonlyMap<string, string> {
  if (!existsSync(folder)) return new Map();
  const extensions = new Map<string, string>();
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    const manifest = path.join(folder, entry.name, 'package.json');
    if (!entry.isDirectory() || !existsSync(manifest)) continue;
    const { name } = packageSchema.parse(JSON.parse(readFileSync(manifest, 'utf8')));
    extensions.set(name, path.join(folder, entry.name));
  }
  return extensions;
}

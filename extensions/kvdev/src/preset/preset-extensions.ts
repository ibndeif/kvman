import path from 'node:path';
import type { extensionInfoSchema, Preset, z } from '@kvman/sdk';
import { readProjectManifest } from '../folders.ts';

// The extension half of `preset check` (ADR 0009, 122): a `bundled` name must be one this kvman bundles (the four are
// always loaded while kvdev runs); a `path:` folder, relative to the preset file, must hold a project; an `npm:`
// source is checked for its format only, by the preset schema. It also tells which namespaces the preset has.

export type ExtensionInfo = z.infer<typeof extensionInfoSchema>;

export type PresetReach = {
  /** Namespaces of the preset's extensions loaded here, whose settings and pages can be checked. */
  loaded: ReadonlySet<string>;
  /** Namespaces of its `path:` extensions, which aren't loaded here. */
  unloaded: ReadonlySet<string>;
  /** Whether it has `npm:` extensions, whose namespaces aren't known without fetching them. */
  hasNpm: boolean;
  problems: { message: string; hint: string }[];
};

export function presetReach(preset: Preset, presetFile: string, extensions: readonly ExtensionInfo[]): PresetReach {
  const loaded = new Set<string>();
  const unloaded = new Set<string>();
  const problems: PresetReach['problems'] = [];
  let hasNpm = false;
  for (const [name, source] of Object.entries(preset.extensions)) {
    if (source === 'bundled') {
      const bundled = extensions.find((extension) => extension.name === name && extension.source === 'bundled');
      if (bundled === undefined) problems.push({ message: `${name} isn't a bundled extension.`, hint: `The bundled extensions are ${extensions.filter((extension) => extension.source === 'bundled').map((extension) => extension.name).join(', ')}.` });
      else loaded.add(bundled.namespace);
    } else if (source.startsWith('path:')) {
      const folder = path.resolve(path.dirname(presetFile), source.slice('path:'.length));
      const manifest = readProjectManifest(folder);
      if (manifest === undefined) problems.push({ message: `${name}: ${folder} has no package.json with a kvman field.`, hint: 'A path: source is a project folder, relative to the preset file.' });
      else unloaded.add(manifest.namespace);
    } else {
      hasNpm = true;
    }
  }
  return { loaded, unloaded, hasNpm, problems };
}

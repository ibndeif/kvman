import path from 'node:path';
import { extensionInfoSchema, type Preset, type z } from '@kvman/sdk';
import { readProjectManifest } from './project-manifest.ts';

// The extension half of `preset check` (plan 09 §9.1): a `bundled` name must be one the running kvman bundles; a
// `path:` folder, relative to the preset file, must hold a project; an `npm:` source is checked for its format only,
// by the preset schema. It also tells which namespaces the preset has. With no kvman (`extensions` undefined) the
// `bundled` names can't be checked, so only the `path:` folders are reported.

/** An extension as `kernel.extensions.list` describes it. */
export type ExtensionInfo = z.infer<typeof extensionInfoSchema>;

export type PresetReach = {
  /** Namespaces of the preset's extensions loaded by the running kvman, whose settings and pages can be checked. */
  loaded: ReadonlySet<string>;
  /** Namespaces of its `path:` extensions, which aren't loaded by the running kvman. */
  unloaded: ReadonlySet<string>;
  /** Whether it has `npm:` extensions, whose namespaces aren't known without fetching them. */
  hasNpm: boolean;
  problems: { message: string; hint: string }[];
};

/** Sorts the preset's extensions into loaded and unloaded namespaces, with a problem per bad reference. */
export function presetReach(preset: Preset, presetFile: string, extensions: readonly ExtensionInfo[] | undefined): PresetReach {
  const loaded = new Set<string>();
  const unloaded = new Set<string>();
  const problems: PresetReach['problems'] = [];
  let hasNpm = false;
  for (const [name, source] of Object.entries(preset.extensions)) {
    if (source === 'bundled') {
      const bundled = extensions?.find((extension) => extension.name === name && extension.source === 'bundled');
      if (bundled !== undefined) loaded.add(bundled.namespace);
      else if (extensions !== undefined) {
        problems.push({ message: `${name} isn't a bundled extension.`, hint: `The bundled extensions are ${extensions.filter((extension) => extension.source === 'bundled').map((extension) => extension.name).join(', ')}.` });
      }
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

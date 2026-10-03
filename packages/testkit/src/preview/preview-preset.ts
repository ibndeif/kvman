import path from 'node:path';
import type { Preset } from '@kvman/sdk';

// The preview's generated preset (plan 09 §9.3, ADR 0009, 119, 126): the dev extensions as absolute `path:` entries,
// plus kvai and kvwebui with the Extensions page as home; or a given preset, its `path:` entries made absolute (the
// generated file lives in the preview's home), with the dev extensions added over entries of the same name.

/** An extension folder to preview, by package name. */
export type PreviewExtension = { name: string; folder: string };

/** A preset the preview builds on, with the folder its `path:` entries resolve against. */
export type GivenPreset = { preset: Preset; folder: string };

function absoluteSources(given: GivenPreset): Preset['extensions'] {
  return Object.fromEntries(
    Object.entries(given.preset.extensions).map(([name, source]) => [name, source.startsWith('path:') ? `path:${path.resolve(given.folder, source.slice('path:'.length))}` : source]),
  );
}

/** Builds the preview's preset from the dev extensions, optionally over a given preset. */
export function previewPreset(extensions: readonly PreviewExtension[], given?: GivenPreset): Preset {
  const dev = Object.fromEntries(extensions.map((extension): [string, `path:${string}`] => [extension.name, `path:${extension.folder}`]));
  if (given === undefined) {
    return { name: 'preview', extensions: { '@kvman/kvai': 'bundled', '@kvman/kvwebui': 'bundled', ...dev }, settings: { 'kvwebui.home': 'kvwebui.extensions' } };
  }
  return { ...given.preset, extensions: { ...absoluteSources(given), ...dev } };
}

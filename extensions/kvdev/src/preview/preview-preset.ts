import path from 'node:path';
import type { Preset } from '@kvman/sdk';

// The preview's preset (plan 09 §9.3, ADR 0009, 119, 126): the dev extensions as absolute `path:` entries, plus kvai
// and kvwebui with the Extensions page as home; or a given preset, its `path:` entries made absolute (the generated
// file lives in the preview's home), with the dev extensions added over entries of the same name, keeping its home.

export type DevExtension = { name: string; folder: string };

export type GivenPreset = { preset: Preset; folder: string };

function absoluteSources(given: GivenPreset): Preset['extensions'] {
  return Object.fromEntries(
    Object.entries(given.preset.extensions).map(([name, source]) => [name, source.startsWith('path:') ? `path:${path.resolve(given.folder, source.slice('path:'.length))}` : source]),
  );
}

export function previewPreset(extensions: readonly DevExtension[], given?: GivenPreset): Preset {
  const dev = Object.fromEntries(extensions.map((extension): [string, `path:${string}`] => [extension.name, `path:${extension.folder}`]));
  if (given === undefined) {
    return { name: 'preview', extensions: { '@kvman/kvai': 'bundled', '@kvman/kvwebui': 'bundled', ...dev }, settings: { 'kvwebui.home': 'kvwebui.extensions' } };
  }
  return { ...given.preset, extensions: { ...absoluteSources(given), ...dev } };
}

export type PreviewLaunch = { execPath: string; execArgv: readonly string[]; entry: string; home: string; port: number; presetFile: string };

/** The preview kvman's command line: this kvman's Node, flags, and entry file, on its own home and port. */
export function previewCommand(launch: PreviewLaunch): { command: string; args: string[] } {
  return {
    command: launch.execPath,
    args: [...launch.execArgv, launch.entry, '--home', launch.home, '--port', String(launch.port), '--yes', '--no-open', '--preset', launch.presetFile],
  };
}

export const firstPreviewPort = 3738;
export const lastPreviewPort = 3837;

/** The first port from 3738 to 3837 that `isFree` accepts, or `undefined` when none is. */
export async function previewPort(isFree: (port: number) => Promise<boolean>): Promise<number | undefined> {
  for (let port = firstPreviewPort; port <= lastPreviewPort; port += 1) {
    if (await isFree(port)) return port;
  }
  return undefined;
}

import type { ExtensionSource } from '@kvman/sdk';
import { problemOf } from '../api/client.ts';
import { kernelQuery } from '../api/kernel.ts';
import type { Kvwebui } from './kvwebui.ts';

// The preset as stored now (plan 06 §6.6, ADR 0010, 5): what `kernel.preset.get` gives, and what a restart will change
// against the extensions loaded now. A failure to read it hides the marks and shows an error card.

/** Reads the stored preset again; a Problem is kept for the page to show, and any other error is thrown. */
export async function reloadPreset(state: Kvwebui): Promise<void> {
  try {
    state.preset.value = await kernelQuery(state.api, 'kernel.preset.get', {});
    state.presetProblem.value = undefined;
  } catch (error) {
    state.preset.value = undefined;
    state.presetProblem.value = problemOf(error);
  }
}

/** Extensions the stored preset has that aren't loaded, and loaded ones it no longer has. */
export type PendingChanges = { starting: { name: string; source: ExtensionSource }[]; removed: ReadonlySet<string> };

export function pendingChanges(state: Kvwebui): PendingChanges {
  const stored = state.preset.value?.extensions;
  if (stored === undefined) return { starting: [], removed: new Set() };
  const loaded = new Set(state.extensions.value.map((extension) => extension.name));
  return {
    starting: Object.entries(stored)
      .filter(([name]) => !loaded.has(name))
      .map(([name, source]) => ({ name, source })),
    removed: new Set([...loaded].filter((name) => !(name in stored))),
  };
}

/** The translation key of a source's label: Bundled, npm, or Local folder. */
export function sourceKey(source: string): string {
  if (source === 'bundled') return 'kvwebui.extensions.bundled';
  return source.startsWith('npm:') ? 'kvwebui.extensions.npm' : 'kvwebui.extensions.path';
}

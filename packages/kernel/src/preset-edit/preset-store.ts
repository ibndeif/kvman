import path from 'node:path';
import type { InstallSource, Json, Preset, PresetState } from '@kvman/sdk';
import { kernelProblem } from '../problems.ts';
import { resolveInstallSource } from './install-source.ts';
import { keepPresetBackup } from './preset-backup.ts';
import { readStoredPreset, targetFileFor, writePresetFile } from './preset-files.ts';
import { checkedSaveTarget } from './preset-save.ts';
import type { PresetSource } from './preset-source.ts';

// The run's stored preset on the main thread (plan 02 §2.10, ADR 0010, 5 and 13): `get` shows the file as it is on
// disk now, and each edit rewrites it whole. Edits run one after the other, each seeing the previous one's result.
// Nothing is installed, loaded, or trusted here; a restart applies the edit.

export type PresetStoreOptions = {
  home: string;
  preset: Preset;
  source: PresetSource;
  bundled: ReadonlyMap<string, string>;
  dependencies: ReadonlyMap<string, readonly string[]>;
};

export type PresetStore = {
  get(): Promise<PresetState>;
  install(source: InstallSource): Promise<{ file: string; restartRequired: true }>;
  uninstall(name: string): Promise<{ file: string; restartRequired: true }>;
  // `registered`: the key is registered in this run, so the caller has checked its value. `required`: it has no default.
  setSetting(key: string, value: Json, registered: boolean): Promise<{ file: string; restartRequired: true }>;
  resetSetting(key: string, required: boolean): Promise<{ file: string; restartRequired: true }>;
  save(preset: Preset, replace: boolean): Promise<{ file: string }>;
};

export function createPresetStore(options: PresetStoreOptions): PresetStore {
  let stored = options.preset;
  let origin = options.source.origin;
  let file = options.source.origin === 'bundled' ? undefined : options.source.file;
  let pending: Promise<void> = Promise.resolve();
  const serial = <T>(work: () => Promise<T>): Promise<T> => {
    const next = pending.then(work);
    pending = next.then(() => undefined, () => undefined);
    return next;
  };

  // The first edit of a bundled preset copies the run's preset to `<home>/presets/<name>.json`; from then on the
  // stored preset is that file. Later runs start from the file itself, so no copy is needed.
  const currentAndTarget = async (): Promise<{ current: Preset; target: string }> => {
    if (origin === 'bundled') return { current: stored, target: targetFileFor(options.home, stored.name) };
    const target = file ?? targetFileFor(options.home, stored.name);
    return { current: await readStoredPreset(target), target };
  };

  const remember = (edited: Preset, target: string): { file: string; restartRequired: true } => {
    stored = edited;
    if (origin === 'bundled') origin = 'home';
    file = target;
    return { file: target, restartRequired: true };
  };

  // A value for a key no extension of this run registers waits for an extension that isn't loaded yet.
  const waitsForExtension = (current: Preset): boolean => Object.keys(current.extensions).some((name) => !options.dependencies.has(name));

  return {
    get: () =>
      serial(async () => {
        if (origin === 'bundled') return { ...stored, origin };
        const target = file ?? targetFileFor(options.home, stored.name);
        stored = await readStoredPreset(target);
        return { ...stored, origin, file: target };
      }),
    install: (source) =>
      serial(async () => {
        const { current, target } = await currentAndTarget();
        const { name, storedSource } = await resolveInstallSource(source, path.dirname(target));
        if (current.extensions[name] !== undefined) {
          throw kernelProblem('VALIDATION_FAILED', `${name} is already in the preset.`, { name });
        }
        if (storedSource === 'bundled' && !options.bundled.has(name)) {
          throw kernelProblem('VALIDATION_FAILED', `${name} is not a bundled extension.`, { name });
        }
        const edited: Preset = { ...current, extensions: { ...current.extensions, [name]: storedSource } };
        await keepPresetBackup(target, current);
        await writePresetFile(target, edited);
        return remember(edited, target);
      }),
    uninstall: (name) =>
      serial(async () => {
        const { current, target } = await currentAndTarget();
        if (current.extensions[name] === undefined) {
          throw kernelProblem('NOT_FOUND', `${name} is not in the preset.`, { name });
        }
        // Only the run's loaded extensions can be checked; an entry that wasn't loaded this run is skipped.
        const dependents = Object.keys(current.extensions).filter(
          (other) => other !== name && (options.dependencies.get(other) ?? []).includes(name),
        );
        if (dependents.length > 0) {
          throw kernelProblem('VALIDATION_FAILED', `${name} is still needed by ${dependents.join(', ')}.`, { name, dependents });
        }
        const edited: Preset = { ...current, extensions: Object.fromEntries(Object.entries(current.extensions).filter(([other]) => other !== name)) };
        await keepPresetBackup(target, current);
        await writePresetFile(target, edited);
        return remember(edited, target);
      }),
    setSetting: (key, value, registered) =>
      serial(async () => {
        const { current, target } = await currentAndTarget();
        if (!registered && !waitsForExtension(current)) {
          throw kernelProblem('VALIDATION_FAILED', `No extension registers the setting "${key}".`, { key });
        }
        const edited: Preset = { ...current, settings: { ...current.settings, [key]: value } };
        await keepPresetBackup(target, current);
        await writePresetFile(target, edited);
        return remember(edited, target);
      }),
    resetSetting: (key, required) =>
      serial(async () => {
        const { current, target } = await currentAndTarget();
        const { settings = {} } = current;
        if (!Object.hasOwn(settings, key)) {
          throw kernelProblem('NOT_FOUND', `The preset has no value for "${key}".`, { key });
        }
        if (required) {
          throw kernelProblem('VALIDATION_FAILED', `The setting "${key}" has no default, so the preset must set it.`, { key });
        }
        const remaining = Object.fromEntries(Object.entries(settings).filter(([other]) => other !== key));
        const edited: Preset =
          Object.keys(remaining).length === 0 ? { name: current.name, extensions: current.extensions } : { ...current, settings: remaining };
        await keepPresetBackup(target, current);
        await writePresetFile(target, edited);
        return remember(edited, target);
      }),
    // Another preset's file: no backup, and the stored state of the running preset stays as it is.
    save: (preset, replace) =>
      serial(async () => {
        const target = await checkedSaveTarget(options.home, options.preset.name, preset, replace);
        await writePresetFile(target, preset);
        return { file: target };
      }),
  };
}

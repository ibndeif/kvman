import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { PresetSource } from '@kvman/kernel';
import { presetSchema, ProblemError, type Preset } from '@kvman/sdk';

// Finding the preset `--preset` names (plan 01 §1.2, ADR 0010, 4): a value with `/` or `\`, or ending in `.json`, is a
// file relative to the start folder; any other value is a name, which is `<home>/presets/<name>.json` first (a
// person's preset replaces a bundled one of the same name) and then a bundled preset. Every miss fails
// VALIDATION_FAILED, like an invalid preset (plan 02 §2.10).

export type PresetFolders = { bundled: string; home: string; start: string };

export type FoundPreset = { preset: Preset; presetFolder: string; source: PresetSource };

export const defaultPreset = 'coder';

function invalid(message: string, params: Record<string, string>): ProblemError {
  return new ProblemError({ code: 'VALIDATION_FAILED', message, params });
}

export function isPresetFile(value: string): boolean {
  return value.includes('/') || value.includes('\\') || value.endsWith('.json');
}

function readPreset(file: string, source: PresetSource): FoundPreset {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw invalid(`The preset ${file} can't be read (${reason}).`, { file });
  }
  const result = presetSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `${issue.path.join('.') || 'preset'}: ${issue.message}`).join('; ');
    throw invalid(`The preset ${file} is invalid (${issues}).`, { file });
  }
  return { preset: result.data, presetFolder: path.dirname(file), source };
}

function namedPreset(name: string, folders: PresetFolders): FoundPreset {
  const own = path.join(folders.home, 'presets', `${name}.json`);
  if (existsSync(own)) return readPreset(own, { origin: 'home', file: own });
  const bundled = path.join(folders.bundled, `${name}.json`);
  if (existsSync(bundled)) return readPreset(bundled, { origin: 'bundled' });
  throw invalid(`There is no preset named ${name}: neither a bundled one nor ${own}.`, { preset: name });
}

/** The file an edit of the preset `value` writes: the preset file given, or `<home>/presets/<name>.json` (ADR 0024, 5). */
export function editableFile(value: string, folders: PresetFolders): string {
  return isPresetFile(value) ? path.resolve(folders.start, value) : path.join(folders.home, 'presets', `${value}.json`);
}

export function findPreset(value: string, folders: PresetFolders): FoundPreset {
  if (isPresetFile(value)) {
    const file = path.resolve(folders.start, value);
    return readPreset(file, { origin: 'file', file });
  }
  return namedPreset(value, folders);
}

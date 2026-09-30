import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { presetSchema, ProblemError, type Preset } from '@kvman/sdk';

// Finding the preset `--preset` names (plan 01 §1.2, ADR 0009, 45): a value with `/` or `\`, or ending in `.json`, is a
// file relative to the start folder; any other value is a name, which must be exactly one of a bundled preset and
// `<home>/presets/<name>.json`. Every miss fails VALIDATION_FAILED, like an invalid preset (plan 02 §2.10).

export type PresetFolders = { bundled: string; home: string; start: string };

export type FoundPreset = { preset: Preset; presetFolder: string };

export const defaultPreset = 'coder';

function invalid(message: string, params: Record<string, string>): ProblemError {
  return new ProblemError({ code: 'VALIDATION_FAILED', message, params });
}

export function isPresetFile(value: string): boolean {
  return value.includes('/') || value.includes('\\') || value.endsWith('.json');
}

function readPreset(file: string): FoundPreset {
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
  return { preset: result.data, presetFolder: path.dirname(file) };
}

function namedPresetFile(name: string, folders: PresetFolders): string {
  const candidates = [path.join(folders.bundled, `${name}.json`), path.join(folders.home, 'presets', `${name}.json`)].filter((file) => existsSync(file));
  const [only, other] = candidates;
  if (only === undefined) throw invalid(`There is no preset named ${name}: neither a bundled one nor ${path.join(folders.home, 'presets', `${name}.json`)}.`, { preset: name });
  if (other !== undefined) throw invalid(`The preset name ${name} is both bundled and in ${path.join(folders.home, 'presets')}; rename your own.`, { preset: name, files: candidates.join(', ') });
  return only;
}

export function findPreset(value: string, folders: PresetFolders): FoundPreset {
  return readPreset(isPresetFile(value) ? path.resolve(folders.start, value) : namedPresetFile(value, folders));
}

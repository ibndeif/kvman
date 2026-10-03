import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Preset } from '@kvman/sdk';
import { BinFailure } from '../bin/bin-failure.ts';

// `kvman-preset new` (plan 09 §9.1): a preset that runs as-is, kvai and kvwebui with the Extensions page as its
// home, for the person to add extensions and settings to. `<file>` resolves against the current working folder.

/** Writes the starting preset to `file` and resolves to its absolute path. */
export function writePresetFile(file: string, name: string): { file: string } {
  const absolute = path.resolve(file);
  if (existsSync(absolute)) throw new BinFailure('FILE_EXISTS', `${file} already exists; choose another file.`, { file });
  const preset: Preset = { name, extensions: { '@kvman/kvai': 'bundled', '@kvman/kvwebui': 'bundled' }, settings: { 'kvwebui.home': 'kvwebui.extensions' } };
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, `${JSON.stringify(preset, null, 2)}\n`);
  return { file: absolute };
}

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Preset } from '@kvman/sdk';
import { insideWorkspace, workspaceRelative } from '../folders.ts';
import { kvdevProblem } from '../problems.ts';

// `preset new` (plan 09 §9.1, ADR 0009, 123): a preset that runs as-is, kvai and kvwebui with the Extensions page as
// its home, for the agent to add extensions and settings to.

export function newPreset(workspaceFolder: string, name: string, file: string): { file: string } {
  const absolute = insideWorkspace(workspaceFolder, file, 'file');
  if (existsSync(absolute)) throw kvdevProblem('FILE_EXISTS', `${file} already exists; choose another file.`, { file });
  const preset: Preset = { name, extensions: { '@kvman/kvai': 'bundled', '@kvman/kvwebui': 'bundled' }, settings: { 'kvwebui.home': 'kvwebui.extensions' } };
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, `${JSON.stringify(preset, null, 2)}\n`);
  return { file: workspaceRelative(workspaceFolder, absolute) };
}

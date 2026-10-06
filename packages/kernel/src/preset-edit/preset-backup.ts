import { mkdir, writeFile } from 'node:fs/promises';
import { renameSync, rmSync } from 'node:fs';
import path from 'node:path';
import type { Preset } from '@kvman/sdk';
import { kernelProblem } from '../problems.ts';
import { presetFileText } from './preset-files.ts';

// The backup beside a preset file (plan 02 §2.10, ADR 0024, 4 and 5): `<file>.good` is the preset as it ran before the
// first edit since a good start. A start that fails because of the preset restores it, and a good start deletes it.

/** The backup of a preset file. */
export function presetBackupFor(file: string): string {
  return `${file}.good`;
}

function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code;
}

/** Writes the backup of `file` from the preset as it runs, unless one exists: later edits keep the first. */
export async function keepPresetBackup(file: string, running: Preset): Promise<void> {
  const backup = presetBackupFor(file);
  const text = presetFileText(backup, running);
  try {
    await mkdir(path.dirname(backup), { recursive: true });
    await writeFile(backup, text, { flag: 'wx' });
  } catch (error: unknown) {
    if (hasCode(error, 'EEXIST')) return;
    throw kernelProblem('VALIDATION_FAILED', `The preset backup ${backup} can't be written (${error instanceof Error ? error.message : String(error)}).`, { file: backup });
  }
}

/** Puts the backup in place of `file` and answers whether there was one. */
export function restorePresetBackup(file: string): boolean {
  try {
    renameSync(presetBackupFor(file), file);
    return true;
  } catch (error: unknown) {
    if (hasCode(error, 'ENOENT')) return false;
    throw error;
  }
}

/** Deletes the backup of `file`, if any. */
export function discardPresetBackup(file: string): void {
  rmSync(presetBackupFor(file), { force: true });
}

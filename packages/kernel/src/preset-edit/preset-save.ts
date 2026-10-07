import { access } from 'node:fs/promises';
import path from 'node:path';
import type { Preset } from '@kvman/sdk';
import { kernelProblem } from '../problems.ts';
import { targetFileFor } from './preset-files.ts';

// What `kernel.presets.save` checks before it writes (plan 02 §2.10, ADR 0030, 5): the name is a file name inside
// `presets/` that `--preset` reads as a name, a `path:` folder is absolute, and nothing is overwritten by accident.

const namePattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const pathPrefix = 'path:';

async function exists(file: string): Promise<boolean> {
  return access(file).then(
    () => true,
    () => false,
  );
}

/** The file `preset` is saved to; fails `VALIDATION_FAILED`, with nothing written, when the preset can't be saved. */
export async function checkedSaveTarget(home: string, running: string, preset: Preset, replace: boolean): Promise<string> {
  if (!namePattern.test(preset.name)) {
    throw kernelProblem('VALIDATION_FAILED', `The preset name ${preset.name} must be lowercase words joined by hyphens.`, { name: preset.name });
  }
  for (const [extension, source] of Object.entries(preset.extensions)) {
    if (source.startsWith(pathPrefix) && !path.isAbsolute(source.slice(pathPrefix.length))) {
      throw kernelProblem('VALIDATION_FAILED', `The folder of ${extension} must be an absolute path.`, { name: extension, source });
    }
  }
  if (preset.name === running) {
    throw kernelProblem('VALIDATION_FAILED', `${preset.name} is the running preset; change it with the edit commands.`, { name: preset.name });
  }
  const file = targetFileFor(home, preset.name);
  if (!replace && (await exists(file))) {
    throw kernelProblem('VALIDATION_FAILED', `The preset file ${file} exists; save with replace to overwrite it.`, { file });
  }
  return file;
}

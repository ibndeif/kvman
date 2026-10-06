import { restorePresetBackup, startKernel, type Kernel } from '@kvman/kernel';
import { ProblemError, type Problem } from '@kvman/sdk';
import type { RunArguments } from './arguments.ts';
import { bundledExtensions } from './bundled.ts';
import type { CliEnvironment } from './run-kvman.ts';
import { defaultPreset, editableFile, findPreset, type PresetFolders } from './preset-lookup.ts';
import { failureLines } from './terminal.ts';
import { trustDecision } from './trust-prompt.ts';

// Starting the kernel for a run (plan 02 §2.14, ADR 0024, 5): a start that fails because of the preset, while the
// backup of the last edit exists, restores the preset and starts once more.

// The failures that a preset edit can cause; `PORT_IN_USE` and the like are not undone by restoring a file.
const undoable: ReadonlySet<string> = new Set(['EXTENSION_INVALID', 'VALIDATION_FAILED']);

function startOnce(args: RunArguments, folders: PresetFolders, environment: CliEnvironment, rolledBack: Problem | undefined): Promise<Kernel> {
  const found = findPreset(args.preset ?? defaultPreset, folders);
  return startKernel({
    home: folders.home,
    homeFolder: environment.userFolder,
    preset: found.preset,
    presetFolder: found.presetFolder,
    presetSource: found.source,
    bundled: bundledExtensions(),
    mode: args.mode ?? 'web',
    logLevel: args.logLevel,
    terminalLog: true,
    startFolder: environment.startFolder,
    trust: trustDecision(args.yes, environment.terminal),
    ...(rolledBack === undefined ? {} : { rolledBack }),
  });
}

export async function startOrUndo(args: RunArguments, folders: PresetFolders, environment: CliEnvironment): Promise<Kernel> {
  try {
    return await startOnce(args, folders, environment, undefined);
  } catch (error) {
    if (!(error instanceof ProblemError) || !undoable.has(error.problem.code)) throw error;
    if (!restorePresetBackup(editableFile(args.preset ?? defaultPreset, folders))) throw error;
    environment.errors.write(`${failureLines(error.problem)}The last change to the preset was undone.\n`);
    return startOnce(args, folders, environment, error.problem);
  }
}

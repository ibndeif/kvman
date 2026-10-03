import { mkdirSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { BinFailure } from '../bin/bin-failure.ts';
import { lastLines, runProgram } from '../bin/run-program.ts';
import { scaffoldFiles, type ScaffoldInput } from './scaffold-files.ts';

// `kvman-new` (plan 09 §9.2): the folder is the bin's argument as given, resolved against the current working
// folder. It must be new or empty; the scaffold is written, then `npm install` runs in it. A failed install keeps
// the files, so it can be run again.

export type NewProject = { folder: string; name: string; namespace: string; web: boolean };

function assertEmpty(absolute: string, given: string): void {
  if (!existsSync(absolute)) return;
  if (!statSync(absolute).isDirectory() || readdirSync(absolute).length > 0) throw new BinFailure('FOLDER_NOT_EMPTY', `${given} isn't empty; choose a new or empty folder.`, { folder: given });
}

export async function newProject(input: ScaffoldInput & { folder: string }): Promise<NewProject> {
  const absolute = path.resolve(input.folder);
  assertEmpty(absolute, input.folder);
  for (const [file, content] of Object.entries(scaffoldFiles(input))) {
    mkdirSync(path.dirname(path.join(absolute, file)), { recursive: true });
    writeFileSync(path.join(absolute, file), content);
  }
  let install;
  try {
    install = await runProgram('npm', ['install'], absolute);
  } catch (error) {
    if (error instanceof BinFailure) throw new BinFailure('NPM_FAILED', error.message, { folder: absolute });
    throw error;
  }
  if (install.exitCode !== 0) {
    throw new BinFailure('NPM_FAILED', `npm install failed in ${input.folder} (exit code ${String(install.exitCode)}):\n${lastLines(install.output)}`, {
      folder: absolute,
      exitCode: install.exitCode,
    });
  }
  return { folder: absolute, name: input.name, namespace: input.namespace, web: input.web };
}

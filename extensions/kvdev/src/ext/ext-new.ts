import { mkdirSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { insideWorkspace, workspaceRelative } from '../folders.ts';
import { kvdevProblem } from '../problems.ts';
import { lastLines, runProgram } from '../run-program.ts';
import { scaffoldFiles, type ScaffoldInput } from './scaffold-files.ts';

// `ext new` (plan 09 §9.1–9.2, ADR 0009, 121): the folder must be new or empty; the scaffold is written, then
// `npm install` runs in it. A failed install keeps the files, so it can be run again.

export type NewProject = { folder: string; name: string; namespace: string; web: boolean };

function assertEmpty(folder: string, relative: string): void {
  if (!existsSync(folder)) return;
  if (!statSync(folder).isDirectory() || readdirSync(folder).length > 0) throw kvdevProblem('FOLDER_NOT_EMPTY', `${relative} isn't empty; choose a new or empty folder.`, { folder: relative });
}

export async function newProject(workspaceFolder: string, input: ScaffoldInput & { folder: string }, signal: AbortSignal): Promise<NewProject> {
  const folder = insideWorkspace(workspaceFolder, input.folder, 'folder');
  assertEmpty(folder, input.folder);
  for (const [file, content] of Object.entries(scaffoldFiles(input))) {
    mkdirSync(path.dirname(path.join(folder, file)), { recursive: true });
    writeFileSync(path.join(folder, file), content);
  }
  const install = await runProgram('npm', ['install'], folder, signal);
  if (install.exitCode !== 0) throw kvdevProblem('NPM_FAILED', `npm install failed in ${input.folder} (exit code ${String(install.exitCode)}):\n${lastLines(install.output)}`, { folder: input.folder, exitCode: install.exitCode });
  return { folder: workspaceRelative(workspaceFolder, folder), name: input.name, namespace: input.namespace, web: input.web };
}

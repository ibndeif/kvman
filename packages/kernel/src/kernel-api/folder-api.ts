import { mkdir, readdir, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { kernelCommandSchemas, kernelQuerySchemas } from '@kvman/sdk';
import { kernelProblem } from '../problems.ts';
import { folderNameProblem } from './folder-name.ts';
import type { KernelApiServices } from './kernel-api-services.ts';
import type { KernelRegistrations } from './kernel-registrations.ts';

// `kernel.folder.list` and `kernel.folder.create` (plan 02 §2.12, ADR 0009, 219, 222, and 223): the sub-folders of a folder,
// for choosing a workspace folder, and one new folder inside one. Listing reads names and nothing else; creating makes a
// single folder and records nothing.

const folderLimit = 1000;

const unreadable = (folder: string, error: unknown): Error => kernelProblem('VALIDATION_FAILED', `The folder can't be read (${error instanceof Error ? error.message : String(error)}).`, { path: folder });

async function realFolder(folder: string): Promise<string> {
  if (!path.isAbsolute(folder)) throw kernelProblem('VALIDATION_FAILED', 'A folder path must be absolute.', { path: folder });
  const real = await realpath(folder).catch((error: unknown) => {
    throw unreadable(folder, error);
  });
  if (!(await stat(real)).isDirectory()) throw kernelProblem('VALIDATION_FAILED', 'A folder path must be a folder.', { path: folder });
  return real;
}

async function isFolder(entry: { isDirectory(): boolean; isSymbolicLink(): boolean }, location: string): Promise<boolean> {
  if (entry.isDirectory()) return true;
  if (!entry.isSymbolicLink()) return false;
  return stat(location).then((found) => found.isDirectory(), () => false);
}

export function registerFolderApi(api: KernelRegistrations, services: KernelApiServices): void {
  api.query('kernel.folder.list', kernelQuerySchemas['kernel.folder.list'], 'Lists the sub-folders of a folder on this machine.', async (input) => {
    const folder = await realFolder(input.path ?? services.homeFolder);
    const entries = await readdir(folder, { withFileTypes: true }).catch((error: unknown) => {
      throw unreadable(folder, error);
    });
    const shown = entries.filter((entry) => input.hidden === true || !entry.name.startsWith('.')).sort((first, second) => first.name.localeCompare(second.name));
    const checked = await Promise.all(shown.map(async (entry) => ({ entry, folder: await isFolder(entry, path.join(folder, entry.name)) })));
    const folders = checked.filter((found) => found.folder).map(({ entry }) => ({ name: entry.name, path: path.join(folder, entry.name) }));
    const parent = path.dirname(folder);
    return { path: folder, parent: parent === folder ? null : parent, folders: folders.slice(0, folderLimit), truncated: folders.length > folderLimit };
  });
  api.command('kernel.folder.create', kernelCommandSchemas['kernel.folder.create'], 'Makes a folder inside a folder on this machine.', async (input) => {
    const name = input.name.trim();
    const reason = folderNameProblem(name);
    if (reason !== undefined) throw kernelProblem('VALIDATION_FAILED', reason, { name });
    const parent = await realFolder(input.path);
    const made = path.join(parent, name);
    await mkdir(made).catch((error: unknown) => {
      const exists = error instanceof Error && 'code' in error && error.code === 'EEXIST';
      throw kernelProblem('VALIDATION_FAILED', exists ? `A folder or file named ${name} already exists here.` : `The folder can't be made (${error instanceof Error ? error.message : String(error)}).`, { path: made });
    });
    return { path: await realpath(made) };
  });
}

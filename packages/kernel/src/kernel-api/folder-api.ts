import { readdir, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { kernelQuerySchemas } from '@kvman/sdk';
import { kernelProblem } from '../problems.ts';
import type { KernelApiServices } from './kernel-api-services.ts';
import type { KernelRegistrations } from './kernel-registrations.ts';

// `kernel.folder.list` (plan 02 §2.12, ADR 0009, 219): the sub-folders of a folder, for choosing a workspace folder. It
// reads names on this machine and nothing else: no file is listed, nothing is opened or recorded.

const folderLimit = 1000;

async function realFolder(folder: string): Promise<string> {
  if (!path.isAbsolute(folder)) throw kernelProblem('VALIDATION_FAILED', 'A folder path must be absolute.', { path: folder });
  try {
    const real = await realpath(folder);
    if ((await stat(real)).isDirectory()) return real;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw kernelProblem('VALIDATION_FAILED', `The folder can't be read (${reason}).`, { path: folder });
  }
  throw kernelProblem('VALIDATION_FAILED', 'A folder path must be a folder.', { path: folder });
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
      throw kernelProblem('VALIDATION_FAILED', `The folder can't be read (${error instanceof Error ? error.message : String(error)}).`, { path: folder });
    });
    const shown = entries.filter((entry) => input.hidden === true || !entry.name.startsWith('.')).sort((first, second) => first.name.localeCompare(second.name));
    const folders: { name: string; path: string }[] = [];
    let truncated = false;
    for (const entry of shown) {
      const location = path.join(folder, entry.name);
      if (!(await isFolder(entry, location))) continue;
      if (folders.length === folderLimit) {
        truncated = true;
        break;
      }
      folders.push({ name: entry.name, path: location });
    }
    const parent = path.dirname(folder);
    return { path: folder, parent: parent === folder ? null : parent, folders, truncated };
  });
}

import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { invalid, notFound } from '../problems.ts';
import { isMissing } from './read-file.ts';
import { resolveInWorkspace } from './workspace-path.ts';

// `fs list` (plan 08 §8.5, ADR 0011, 8): the files and folders of one folder inside the workspace folder, by name, at
// most 1000. A symlink is listed as what it points to, and one that points nowhere is left out.

const entriesLimit = 1000;

export type Entry = { name: string; kind: 'file' | 'folder'; bytes: number };

export type Listing = { path: string; entries: Entry[]; truncated: boolean };

async function entryOf(folder: string, name: string): Promise<Entry | undefined> {
  const found = await stat(path.join(folder, name)).catch((error: unknown) => {
    if (isMissing(error)) return undefined;
    throw error;
  });
  if (found?.isDirectory() === true) return { name, kind: 'folder', bytes: 0 };
  return found?.isFile() === true ? { name, kind: 'file', bytes: found.size } : undefined;
}

export async function listEntries(workspace: string, input: { path?: string | undefined }): Promise<Listing> {
  const requested = input.path ?? '.';
  const folder = await resolveInWorkspace(workspace, requested);
  const names = await readdir(folder).catch((error: unknown) => {
    if (error instanceof Error && 'code' in error && error.code === 'ENOTDIR') throw invalid(`${requested} is a file; read it with fs read.`, { path: requested });
    if (isMissing(error)) throw notFound(`${requested} doesn't exist.`, { path: requested });
    throw error;
  });
  const entries: Entry[] = [];
  for (const name of names.sort()) {
    const entry = await entryOf(folder, name);
    if (entry === undefined) continue;
    if (entries.length === entriesLimit) return { path: requested, entries, truncated: true };
    entries.push(entry);
  }
  return { path: requested, entries, truncated: false };
}

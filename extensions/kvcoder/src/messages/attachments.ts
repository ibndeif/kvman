import { constants } from 'node:fs';
import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { Ctx, File } from '@kvman/sdk';
import { resolveInWorkspace } from '../files/workspace-path.ts';

// A message's files that aren't images (plan 08 §8.1, ADR 0018, 1 to 4): each is copied into the workspace folder under
// `attachments/`, where the agent opens it with its file commands, and the message's text names them. Nothing is
// overwritten: a name that exists gets `-2`, `-3`, … before its extension.

const folderName = 'attachments';

const isTaken = (error: unknown): boolean => error instanceof Error && 'code' in error && error.code === 'EEXIST';

/** A file's name as it is saved: its base name, with only letters, digits, space, and `._-()` kept. */
export function safeName(name: string): string {
  const base = name.split(/[\\/]/).at(-1) ?? '';
  const safe = base.replace(/[^\p{L}\p{N} ._()-]/gu, '_').trim();
  return safe === '' || safe === '.' || safe === '..' ? 'file' : safe;
}

async function copyUnder(source: string, folder: string, name: string): Promise<string> {
  const { name: stem, ext } = path.parse(name);
  for (let count = 1; ; count += 1) {
    const candidate = count === 1 ? name : `${stem}-${count}${ext}`;
    try {
      await copyFile(source, path.join(folder, candidate), constants.COPYFILE_EXCL);
      return candidate;
    } catch (error) {
      if (!isTaken(error)) throw error;
    }
  }
}

/** Saves the files into the workspace folder and gives their paths in it; a user upload leaves the kernel's files. */
export async function saveAttachments(ctx: Ctx, files: readonly File[]): Promise<string[]> {
  if (files.length === 0) return [];
  const folder = await resolveInWorkspace(ctx.job.workspace.path, folderName);
  await mkdir(folder, { recursive: true });
  const saved: string[] = [];
  for (const file of files) {
    saved.push(`${folderName}/${await copyUnder(await ctx.files.path(file.id), folder, safeName(file.name))}`);
    if (file.owner.kind === 'user') await ctx.files.unlink(file.id);
  }
  return saved;
}

/** The message's text with its saved files named at its end. */
export function withAttachments(text: string, saved: readonly string[]): string {
  return saved.length === 0 ? text : `${text}\n\nAttached files:\n${saved.map((file) => `- ${file}`).join('\n')}`;
}

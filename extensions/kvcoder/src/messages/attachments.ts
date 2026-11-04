import { constants } from 'node:fs';
import { copyFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import type { Ctx, File } from '@kvman/sdk';
import { resolveInWorkspace } from '../files/workspace-path.ts';
import { invalid } from '../problems.ts';

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

const filesLine = '\n\nAttached files:\n';

/** A message's text as typed, and the saved files its end names (ADR 0118, 6). */
export function splitAttachments(text: string): { typed: string; saved: string[] } {
  const at = text.lastIndexOf(filesLine);
  if (at < 0) return { typed: text, saved: [] };
  const lines = text.slice(at + filesLine.length).split('\n');
  if (!lines.every((line) => line.startsWith(`- ${folderName}/`))) return { typed: text, saved: [] };
  return { typed: text.slice(0, at), saved: lines.map((line) => line.slice(2)) };
}

/** Files a message names again, already saved under `attachments/` (ADR 0118, 6): each must be a file there. */
export async function savedAttachments(ctx: Ctx, named: readonly string[]): Promise<string[]> {
  if (named.length === 0) return [];
  const folder = await resolveInWorkspace(ctx.job.workspace.path, folderName);
  const kept: string[] = [];
  for (const name of new Set(named)) {
    const real = await resolveInWorkspace(ctx.job.workspace.path, name);
    const inFolder = path.dirname(real) === folder;
    const file = inFolder ? await stat(real).then((found) => found.isFile(), () => false) : false;
    if (!file) throw invalid(`${name} isn't a file saved under ${folderName}/ in the workspace folder.`, { path: name });
    kept.push(`${folderName}/${path.basename(real)}`);
  }
  return kept;
}

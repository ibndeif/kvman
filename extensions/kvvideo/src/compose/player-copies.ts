import { readFileSync } from 'node:fs';
import path from 'node:path';
import { z, type Ctx } from '@kvman/sdk';

// The player's copies (plan 16 §16.8; ADR 0107, 13 and 14; ADR 0115, 45): a video of at most 512 MiB is copied into
// the kernel's files with its poster, so the chat's card can play it. A new copy of a path replaces the old one, and
// only the newest 10 copies of the workspace are kept; the collection's ids rise with time, so the oldest come first.

export const largestCopyBytes = 512 * 1024 * 1024;
const kept = 10;

const playerSchema = z.object({ path: z.string(), fileId: z.string(), posterFileId: z.string().nullable(), createdAt: z.string() });

/** Whether a video of this size gets a copy for the player. */
export function copied(bytes: number): boolean {
  return bytes <= largestCopyBytes;
}

export type PlayerCopy = { fileId: string | null; posterFileId: string | null };

async function forget(ctx: Ctx, row: z.output<typeof playerSchema> & { id: string }): Promise<void> {
  await ctx.files.unlink(row.fileId);
  if (row.posterFileId !== null) await ctx.files.unlink(row.posterFileId);
  await ctx.store.collection('players', playerSchema).delete(row.id);
}

export async function keepCopy(ctx: Ctx, file: string, shownPath: string, bytes: number, poster: string): Promise<PlayerCopy> {
  if (!copied(bytes)) return { fileId: null, posterFileId: null };
  const players = ctx.store.collection('players', playerSchema);
  const copy = await ctx.files.write(path.basename(file), readFileSync(file), 'video/mp4');
  const posterCopy = await ctx.files.write(path.basename(poster), readFileSync(poster), 'image/jpeg');
  for (const old of await players.find({ path: shownPath }, { limit: 1000 })) await forget(ctx, old);
  await players.insert({ path: shownPath, fileId: copy.id, posterFileId: posterCopy.id, createdAt: new Date().toISOString() });
  const all = await players.find({}, { limit: 1000, order: 'asc' });
  for (const old of all.slice(0, Math.max(0, all.length - kept))) await forget(ctx, old);
  return { fileId: copy.id, posterFileId: posterCopy.id };
}

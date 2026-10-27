import { readFileSync } from 'node:fs';
import path from 'node:path';
import { z, type Ctx } from '@kvman/sdk';

// The player's copies (plan 16 §16.7, ADR 0107, 13 and 14): a video of at most 512 MiB is copied into the kernel's
// files, so the chat's card can play it. A new copy of a path replaces the old one, and only the newest 10 copies of
// the workspace are kept; the collection's ids rise with time, so the oldest come first.

export const largestCopyBytes = 512 * 1024 * 1024;
const kept = 10;

const playerSchema = z.object({ path: z.string(), fileId: z.string(), createdAt: z.string() });

/** Whether a video of this size gets a copy for the player. */
export function copied(bytes: number): boolean {
  return bytes <= largestCopyBytes;
}

export async function keepCopy(ctx: Ctx, file: string, shownPath: string, bytes: number): Promise<string | null> {
  if (!copied(bytes)) return null;
  const players = ctx.store.collection('players', playerSchema);
  const copy = await ctx.files.write(path.basename(file), readFileSync(file), 'video/mp4');
  for (const old of await players.find({ path: shownPath }, { limit: 1000 })) {
    await ctx.files.unlink(old.fileId);
    await players.delete(old.id);
  }
  await players.insert({ path: shownPath, fileId: copy.id, createdAt: new Date().toISOString() });
  const all = await players.find({}, { limit: 1000, order: 'asc' });
  for (const old of all.slice(0, Math.max(0, all.length - kept))) {
    await ctx.files.unlink(old.fileId);
    await players.delete(old.id);
  }
  return copy.id;
}

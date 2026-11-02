import { createHash } from 'node:crypto';
import { z, type Collection, type Ctx, type Files, type JsonObject } from '@kvman/sdk';
import { alignmentSchema, type Alignment } from './alignment.ts';

// The narration cache (plan 16 §16.6; ADR 0115, 40): each spoken sentence's audio, kept in the kernel's files with a
// row in the workspace collection `narrations`, so an unchanged sentence is never paid for twice. Past 2000 rows the
// oldest go with their files; the collection's ids rise with time, so the oldest come first.

const kept = 2000;

const rowSchema = z.object({ key: z.string(), fileId: z.string(), type: z.string(), durationMs: z.number().int().nonnegative(), alignment: alignmentSchema.nullable(), createdAt: z.string() });

/** What makes two sentences sound the same. */
export type SentenceKey = { service: string; voice: string | null; model: string | null; tone: string | null; speed: number; spoken: string };

export type CachedSentence = { audio: Buffer; type: string; durationMs: number; alignment: Alignment | null };

export function sentenceKey(key: SentenceKey): string {
  return createHash('sha256').update(JSON.stringify([key.service, key.voice, key.model, key.tone, key.speed, key.spoken])).digest('hex');
}

const rows = (ctx: Ctx) => ctx.store.collection('narrations', rowSchema);

export async function cachedSentence(ctx: Ctx, key: string): Promise<CachedSentence | undefined> {
  const [row] = await rows(ctx).find({ key }, { limit: 1 });
  if (row === undefined) return undefined;
  return { audio: await ctx.files.read(row.fileId), type: row.type, durationMs: row.durationMs, alignment: row.alignment };
}

export async function keepSentence(ctx: Ctx, key: string, sentence: CachedSentence): Promise<void> {
  const extension = sentence.type === 'audio/wav' ? 'wav' : 'mp3';
  const file = await ctx.files.write(`narration-${key.slice(0, 16)}.${extension}`, sentence.audio, sentence.type);
  const collection = rows(ctx);
  await collection.insert({ key, fileId: file.id, type: sentence.type, durationMs: sentence.durationMs, alignment: sentence.alignment, createdAt: new Date().toISOString() });
  await trimOldest(collection, ctx.files, kept);
}

/** Deletes the oldest rows past `limit`, with their files. */
export async function trimOldest<Row extends JsonObject & { fileId: string }>(collection: Pick<Collection<Row>, 'count' | 'find' | 'delete'>, files: Pick<Files, 'unlink'>, limit: number): Promise<void> {
  const extra = (await collection.count({})) - limit;
  if (extra <= 0) return;
  for (const old of await collection.find({}, { limit: extra, order: 'asc' })) {
    await files.unlink(old.fileId);
    await collection.delete(old.id);
  }
}

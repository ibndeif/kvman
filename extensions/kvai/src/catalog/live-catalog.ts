import type { Api, Model } from '@earendil-works/pi-ai';
import { z, type Ctx } from '@kvman/sdk';

// pi.dev's live model lists (plan 07 §7.2, ADR 0110), one entry per built-in provider in kvai's global store. A list
// counts while it came from the current `kvai.catalog.url` and is newer than pi-ai's built-in data. Each worker keeps
// the lists it read until a refresh writes a new version.

const costSchema = z.object({ input: z.number(), output: z.number(), cacheRead: z.number(), cacheWrite: z.number() }).catchall(z.json());

/** A chat model of a live list: the fields kvai shows and pi-ai needs to call it, and whatever else pi-ai reads. */
export const liveModelSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    api: z.string().min(1),
    provider: z.string().min(1),
    baseUrl: z.string().min(1),
    reasoning: z.boolean(),
    input: z.array(z.enum(['text', 'image'])),
    cost: costSchema,
    contextWindow: z.number().positive(),
    maxTokens: z.number().positive(),
    type: z.literal('chat').exactOptional(),
  })
  .catchall(z.json());

export const liveEntrySchema = z.object({
  provider: z.string().min(1),
  url: z.string().min(1),
  models: z.array(liveModelSchema),
  lastModified: z.number(),
  etag: z.string().nullable(),
});

export type LiveEntry = z.output<typeof liveEntrySchema>;

const versionKey = 'liveCatalog.version';
const pageLimit = 1000;

export async function readLiveEntries(ctx: Ctx): Promise<LiveEntry[]> {
  return ctx.store.global.collection('liveCatalogs', liveEntrySchema).find({}, { limit: pageLimit });
}

/** Saves the providers' new entries, then a new version, so every worker reads the lists again. */
export async function writeLiveEntries(ctx: Ctx, entries: readonly LiveEntry[]): Promise<void> {
  await ctx.store.transaction((tx) => {
    const collection = tx.global.collection('liveCatalogs', liveEntrySchema);
    for (const entry of entries) {
      for (const old of collection.find({ provider: entry.provider }, { limit: pageLimit })) collection.delete(old.id);
      collection.insert(entry);
    }
    tx.global.kv.set(versionKey, ctx.job.id);
  });
}

type Read = { version: string; url: string; byProvider: Map<string, Model<Api>[]> };

let read: Read | undefined;

async function generatedAt(): Promise<number> {
  const { getBuiltinModelDataGeneratedAt } = await import('@earendil-works/pi-ai/providers/all');
  return getBuiltinModelDataGeneratedAt() ?? 0;
}

async function load(ctx: Ctx, version: string, url: string): Promise<Read> {
  const builtAt = await generatedAt();
  const byProvider = new Map<string, Model<Api>[]>();
  for (const entry of await readLiveEntries(ctx)) {
    // A stored model passed `liveModelSchema`, and pi-ai reads the rest of its fields as they came.
    if (entry.url === url && entry.lastModified > builtAt) byProvider.set(entry.provider, entry.models as unknown as Model<Api>[]);
  }
  return { version, url, byProvider };
}

/** The live models of one provider, or of all, that count now; none while `kvai.catalog.url` is `null`. */
export async function liveModels(ctx: Ctx, provider?: string): Promise<Model<Api>[]> {
  const url = await ctx.settings.get('kvai.catalog.url');
  if (url === null) return [];
  const version = String((await ctx.store.global.kv.get(versionKey)) ?? '');
  if (read === undefined || read.version !== version || read.url !== url) read = await load(ctx, version, url);
  if (provider !== undefined) return read.byProvider.get(provider) ?? [];
  return [...read.byProvider.values()].flat();
}

import { describe, expect, it } from 'vitest';
import { sentenceKey, trimOldest, type SentenceKey } from '../../src/narration/narration-cache.ts';

type Row = { fileId: string };

// A collection of rows in insertion order, as the store keeps them by rising id.
function rows(count: number) {
  const stored = Array.from({ length: count }, (_, index) => ({ id: `r${String(index + 1)}`, fileId: `f${String(index + 1)}` }));
  return {
    stored,
    count: async () => stored.length,
    find: async (_filter: unknown, options: { limit: number; order?: 'asc' | 'desc' }) => (options.order === 'asc' ? stored.slice(0, options.limit) : stored.slice(-options.limit).reverse()),
    delete: async (id: string) => {
      stored.splice(stored.findIndex((row) => row.id === id), 1);
    },
  };
}

describe('the narration cache (16 §16.6, ADR 0115, 40)', () => {
  it('M5.6-H11 past its limit, the oldest rows go with their files', async () => {
    const collection = rows(5);
    const unlinked: string[] = [];
    await trimOldest<Row>(collection, { unlink: async (id) => void unlinked.push(id) }, 3);
    expect(unlinked).toEqual(['f1', 'f2']);
    expect(collection.stored.map((row) => row.id)).toEqual(['r3', 'r4', 'r5']);
    await trimOldest<Row>(collection, { unlink: async (id) => void unlinked.push(id) }, 3);
    expect(unlinked).toEqual(['f1', 'f2']);
  });

  it('M5.6-H12 every part of how a sentence is said is in its key', () => {
    const base: SentenceKey = { service: 'openai', voice: 'alloy', model: 'gpt-4o-mini-tts', tone: null, speed: 1, spoken: 'Hi.' };
    const key = sentenceKey(base);
    expect(sentenceKey({ ...base })).toBe(key);
    const changes: Partial<SentenceKey>[] = [{ service: 'elevenlabs' }, { voice: 'nova' }, { model: 'tts-1' }, { tone: 'warm' }, { speed: 0.9 }, { spoken: 'Hello.' }];
    for (const change of changes) expect(sentenceKey({ ...base, ...change })).not.toBe(key);
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });
});

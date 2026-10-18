import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it, vi } from 'vitest';
import { z } from '@kvman/sdk';
import type { TestKernel } from '../../src/index.ts';
import { entry, reloadWait, revisionOf, useHarness } from '../extension-folders.ts';

const harness = useHarness();

const notes = {
  name: '@test/ix',
  namespace: 'ix',
  kvmanExtra: { indexes: { notes: [['owner']] } },
  entry: entry(`
  const notes = () => ctx.store.collection('notes', z.object({ owner: z.string(), tag: z.string() }));
  ctx.registerCommand('ix.note.add', { description: 'Adds a note.', input: z.object({ owner: z.string(), tag: z.string() }), output: z.null(), public: true,
    handle: async (input) => { await notes().insert(input); return null; } });
  ctx.registerQuery('ix.note.list', { description: 'Finds notes.', input: z.record(z.string(), z.string()), output: z.array(z.string()), public: true,
    handle: async (filter) => (await notes().find(filter, { limit: 100 })).map((note) => note.tag) });`),
};

const manifestSchema = z.looseObject({ kvman: z.looseObject({ indexes: z.unknown() }) });

// The store indexes in the kernel's database, by their SQL, read without writing.
function storeIndexSql(kernel: TestKernel): string[] {
  const database = new DatabaseSync(path.join(kernel.home, 'kvman.db'), { readOnly: true });
  try {
    return database.prepare("SELECT sql FROM sqlite_master WHERE type = 'index' AND name GLOB 'store_index_*'").all().map((row) => String(row['sql']));
  } finally {
    database.close();
  }
}

describe('store indexes after a reload (02 §2.5 and §2.9, ADR 0088, 3)', () => {
  it('QA56-H8 a reload builds a newly declared index and drops the one no longer declared', async () => {
    const kernel = await harness.start([notes]);
    for (const [owner, tag] of [['ana', 'a'], ['ana', 'b'], ['bo', 'a']]) await kernel.exec('ix.note.add', { owner: owner ?? '', tag: tag ?? '' });
    expect(await kernel.exec('ix.note.list', { owner: 'ana' })).toEqual(['a', 'b']);
    expect(storeIndexSql(kernel)).toEqual([expect.not.stringContaining('tag')]);

    const file = path.join(harness.folder('@test/ix'), 'package.json');
    const manifest = manifestSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
    writeFileSync(file, JSON.stringify({ ...manifest, kvman: { ...manifest.kvman, indexes: { notes: [['owner', 'tag']] } } }));
    await vi.waitFor(async () => expect(await revisionOf(kernel, '@test/ix')).toBe(1), reloadWait);

    expect(await kernel.exec('ix.note.list', { owner: 'ana', tag: 'b' })).toEqual(['b']);
    expect(await kernel.exec('ix.note.list', { owner: 'ana' })).toEqual(['a', 'b']);
    await vi.waitFor(() => expect(storeIndexSql(kernel)).toEqual([expect.stringContaining('tag')]), reloadWait);
  });
});

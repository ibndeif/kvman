import path from 'node:path';
import { z } from '../packages/sdk/src/index.ts';
import { systemClock } from '../packages/kernel/src/clock.ts';
import { createIdGenerator } from '../packages/kernel/src/ids.ts';
import { openDatabase } from '../packages/kernel/src/storage/database.ts';
import { createStore } from '../packages/kernel/src/store/store.ts';
import type { Benchmark } from './benchmarks.ts';
import { percentile, timedRuns, withBenchHome } from './measure.ts';

// Collection `find` over 10 000 documents with an equality filter (plan 12 §12.3).

const documentCount = 10_000;
const groups = 100;
const document = z.object({ title: z.string(), group: z.string(), done: z.boolean() });

async function measure(): Promise<Record<string, number>> {
  return withBenchHome(async (home) => {
    const connection = openDatabase(path.join(home, 'kvman.db'));
    try {
      const store = createStore(connection, { extension: '@bench/notes', workspaceId: 'home' }, createIdGenerator(systemClock));
      await store.transaction((tx) => {
        const notes = tx.collection('notes', document);
        for (let index = 0; index < documentCount; index += 1) notes.insert({ title: `note ${index}`, group: `g${index % groups}`, done: index % 2 === 0 });
      });
      const notes = store.collection('notes', document);
      await timedRuns(50, (index) => notes.find({ group: `g${index % groups}` }, { limit: 100 }));
      const durations = await timedRuns(500, (index) => notes.find({ group: `g${index % groups}` }, { limit: 100 }));
      return { p99Ms: percentile(durations, 0.99) };
    } finally {
      connection.close();
    }
  });
}

export const storeFind: Benchmark = { name: 'store.find', targets: { p99Ms: { max: 20 } }, measure };

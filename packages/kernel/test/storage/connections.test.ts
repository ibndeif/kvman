import { Worker } from 'node:worker_threads';
import { describe, expect, it } from 'vitest';
import { z } from '@kvman/sdk';
import { createStore } from '../../src/store/store.ts';
import { useTemporaryHomes } from '../temporary-home.ts';

const newHome = useTemporaryHomes();

function insertFromWorker(database: string, text: string): Promise<void> {
  const worker = new Worker(new URL('./fixtures/insert-worker.ts', import.meta.url), {
    workerData: { database, text },
    execArgv: ['--conditions=@kvman/source'],
  });
  return new Promise((resolve, reject) => {
    worker.once('message', () => resolve());
    worker.once('error', reject);
  });
}

describe('connections (02 §2.5)', () => {
  it('M1.3-H1 writes from two worker threads through their own connections are both visible', async () => {
    const test = newHome();
    await Promise.all([insertFromWorker(test.database, 'from the first worker'), insertFromWorker(test.database, 'from the second worker')]);
    const notes = createStore(test.connection, { extension: '@test/notes', workspaceId: 'home' }, test.ids).collection('notes', z.object({ text: z.string() }));
    const texts = (await notes.find({}, { limit: 10 })).map((note) => note.text).sort();
    expect(texts).toEqual(['from the first worker', 'from the second worker']);
  });
});

import { parentPort, workerData } from 'node:worker_threads';
import { z } from '@kvman/sdk';
import { systemClock } from '../../../src/clock.ts';
import { createIdGenerator } from '../../../src/ids.ts';
import { openConnection } from '../../../src/storage/database.ts';
import { createStore } from '../../../src/store/store.ts';

// Opens its own connection to the test's database and inserts one document.
const { database, text } = z.object({ database: z.string(), text: z.string() }).parse(workerData);
const connection = openConnection(database);
const store = createStore(connection, { extension: '@test/notes', workspaceId: 'home' }, createIdGenerator(systemClock));
await store.collection('notes', z.object({ text: z.string() })).insert({ text });
connection.close();
parentPort?.postMessage('inserted');

import { parentPort, workerData } from 'node:worker_threads';
import { betterSqlite3Driver } from '../../storage/better-sqlite3-driver.ts';
import { openReadConnection } from '../../storage/database.ts';
import { UnsupportedFieldName } from '../../store/sql-paths.ts';
import { StoreReader } from '../../store/store-reader.ts';
import { poolRequestOf } from './pool-messages.ts';
import { servePoolRead } from './pool-read.ts';

// A read pool thread (04 §4.1): it runs reads on its own read-only connection and serializes each result here, so the
// kernel's main thread only forwards bytes (ADR 0131).
function databaseFileOf(data: unknown): string {
  if (typeof data === 'object' && data !== null && 'databaseFile' in data && typeof data.databaseFile === 'string') return data.databaseFile;
  throw new Error('a read pool thread starts with { databaseFile }');
}

if (parentPort === null) throw new Error('the read pool thread runs only as a worker thread');
const port = parentPort;
const reader = new StoreReader(openReadConnection(databaseFileOf(workerData), betterSqlite3Driver));
const encoder = new TextEncoder();

// The bytes move to the main thread without a copy.
port.on('message', (value: unknown) => {
  const request = poolRequestOf(value);
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = encoder.encode(JSON.stringify(servePoolRead(reader, request.owner, request.ws, request.read)));
  } catch (error) {
    if (!(error instanceof UnsupportedFieldName)) throw error;
    port.postMessage({ id: request.id, ok: false, detail: error.message });
    return;
  }
  port.postMessage({ id: request.id, ok: true, value: bytes }, [bytes.buffer]);
});

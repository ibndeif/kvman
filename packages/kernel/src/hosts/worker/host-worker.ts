import { parentPort, workerData } from 'node:worker_threads';
import { betterSqlite3Driver } from '../../storage/better-sqlite3-driver.ts';
import { openReadConnection } from '../../storage/database.ts';
import { ConnectionReads } from '../../store/store-reads.ts';
import { StoreReader } from '../../store/store-reader.ts';
import { resolveSdkToKernel } from './sdk-resolution.ts';
import { WorkerRuntime } from './worker-runtime.ts';

function databaseFileOf(data: unknown): string {
  if (typeof data === 'object' && data !== null && 'databaseFile' in data && typeof data.databaseFile === 'string') return data.databaseFile;
  throw new Error('a host worker starts with { databaseFile }');
}

if (parentPort === null) throw new Error('the host worker runs only as a worker thread');
resolveSdkToKernel();
const port = parentPort;
const reads = new ConnectionReads(new StoreReader(openReadConnection(databaseFileOf(workerData), betterSqlite3Driver)));
const runtime = new WorkerRuntime((frame) => port.postMessage(frame), () => reads);
port.on('message', (value: unknown) => runtime.receive(value));

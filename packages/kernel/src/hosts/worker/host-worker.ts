import { parentPort, workerData } from 'node:worker_threads';
import { resolveSdkToKernel } from './sdk-resolution.ts';
import { WorkerRuntime } from './worker-runtime.ts';

function databaseFileOf(data: unknown): string {
  if (typeof data === 'object' && data !== null && 'databaseFile' in data && typeof data.databaseFile === 'string') return data.databaseFile;
  throw new Error('a host worker starts with { databaseFile }');
}

if (parentPort === null) throw new Error('the host worker runs only as a worker thread');
resolveSdkToKernel();
const port = parentPort;
const runtime = new WorkerRuntime((frame) => port.postMessage(frame), databaseFileOf(workerData));
port.on('message', (value: unknown) => runtime.receive(value));

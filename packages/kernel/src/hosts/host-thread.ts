import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import type { KernelToHostFrame } from '@kvman/protocol';

// What the pool needs of one execution host thread; tests pass fake threads.
export interface HostThread {
  post(frame: KernelToHostFrame): void;
  terminate(): void;
}

// `failed` reports an uncaught error that ends the thread; `exit` follows it and is where the loss is handled.
export type HostThreadEvents = { frame(value: unknown): void; failed(error: unknown): void; exit(): void };

export type StartHostThread = (events: HostThreadEvents) => HostThread;

// The worker entry is the sibling module of this one in the same build: `.ts` when the kernel runs from its
// sources, where the worker resolves workspace packages to their sources too, and `.js` from dist.
function workerEntry(): { file: URL; execArgv: string[] } {
  const extension = extname(fileURLToPath(import.meta.url));
  const file = new URL(`./worker/host-worker${extension}`, import.meta.url);
  return { file, execArgv: extension === '.ts' ? ['--conditions=@kvman/source'] : [] };
}

export function workerThreadStarter(databaseFile: string): StartHostThread {
  return (events) => {
    const { file, execArgv } = workerEntry();
    const worker = new Worker(file, { workerData: { databaseFile }, execArgv });
    worker.on('message', (value: unknown) => events.frame(value));
    worker.on('error', (error: unknown) => events.failed(error));
    worker.on('exit', () => events.exit());
    return {
      post: (frame) => worker.postMessage(frame),
      terminate: () => {
        void worker.terminate();
      },
    };
  };
}

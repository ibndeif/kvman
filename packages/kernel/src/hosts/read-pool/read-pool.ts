import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import type { StoreRead } from '@kvman/protocol';
import { poolReplyOf, type PoolRequest } from './pool-messages.ts';

export const defaultReadPoolSize = 2;

// A read's answer: its value as JSON bytes, or why it failed.
export type PoolAnswer = { ok: true; value: Uint8Array } | { ok: false; code: 'VALIDATION_FAILED' | 'INTERNAL'; detail: string };

export interface ReadThread {
  post(request: PoolRequest): void;
  terminate(): void;
}

export type ReadThreadEvents = { reply(value: unknown): void; exit(): void };

export type StartReadThread = (events: ReadThreadEvents) => ReadThread;

// The thread entry is the sibling module of this one in the same build, like the host worker's.
export function readThreadStarter(databaseFile: string): StartReadThread {
  return (events) => {
    const extension = extname(fileURLToPath(import.meta.url));
    const file = new URL(`./read-pool-worker${extension}`, import.meta.url);
    const worker = new Worker(file, { workerData: { databaseFile }, execArgv: extension === '.ts' ? ['--conditions=@kvman/source'] : [] });
    worker.on('message', (value: unknown) => events.reply(value));
    worker.on('exit', () => events.exit());
    return {
      post: (request) => worker.postMessage(request),
      terminate: () => {
        void worker.terminate();
      },
    };
  };
}

type PoolThread = { thread: ReadThread; waiting: Map<number, (answer: PoolAnswer) => void> };

// 04 §4.1, ADR 0131: the threads that serve sandboxed hosts' reads, `readPoolSize` of them, started when first
// needed. A read goes to the thread with the fewest reads waiting.
export class ReadPool {
  readonly #size: number;
  readonly #start: StartReadThread;
  readonly #threads: PoolThread[] = [];
  #nextId = 1;

  constructor(size: number, start: StartReadThread) {
    this.#size = Math.max(1, size);
    this.#start = start;
  }

  read(owner: string, ws: string, read: StoreRead): Promise<PoolAnswer> {
    const target = this.#choose();
    const id = this.#nextId;
    this.#nextId += 1;
    const answered = new Promise<PoolAnswer>((resolve) => target.waiting.set(id, resolve));
    target.thread.post({ id, owner, ws, read });
    return answered;
  }

  threadCount(): number {
    return this.#threads.length;
  }

  close(): void {
    for (const pooled of this.#threads.splice(0)) {
      pooled.thread.terminate();
      this.#fail(pooled, 'the kernel is stopping');
    }
  }

  #choose(): PoolThread {
    const [least] = [...this.#threads].sort((left, right) => left.waiting.size - right.waiting.size);
    if (least !== undefined && (least.waiting.size === 0 || this.#threads.length >= this.#size)) return least;
    return this.#started();
  }

  #started(): PoolThread {
    const pooled: PoolThread = {
      waiting: new Map(),
      thread: this.#start({
        reply: (value) => {
          const reply = poolReplyOf(value);
          const resolve = pooled.waiting.get(reply.id);
          pooled.waiting.delete(reply.id);
          resolve?.(reply.ok ? { ok: true, value: reply.value } : { ok: false, code: 'VALIDATION_FAILED', detail: reply.detail });
        },
        exit: () => {
          const position = this.#threads.indexOf(pooled);
          if (position !== -1) this.#threads.splice(position, 1);
          this.#fail(pooled, 'a read pool thread stopped during the read');
        },
      }),
    };
    this.#threads.push(pooled);
    return pooled;
  }

  #fail(pooled: PoolThread, detail: string): void {
    for (const resolve of pooled.waiting.values()) resolve({ ok: false, code: 'INTERNAL', detail });
    pooled.waiting.clear();
  }
}

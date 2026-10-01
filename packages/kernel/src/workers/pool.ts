import { Worker } from 'node:worker_threads';
import { ProblemError, type Json, type Problem } from '@kvman/sdk';
import type { KernelLogger } from '../logging/logger.ts';
import { kernelProblem } from '../problems.ts';
import { toMainSchema, type AbortReason, type RegistrySummary, type RootJob, type SyncEnd, type ToMain, type WorkerRequest, type WorkerSetup } from './protocol.ts';

// The main thread's pool of worker threads (plan 02 §2.2). Each worker runs up to `concurrency` root jobs at once;
// nested sync calls run inside their root job and take no slot. A worker that dies fails its jobs `WORKER_CRASHED`,
// and a replacement takes its place. After a hot reload the old pool retires: its workers take no new jobs and exit
// when their running jobs end (plan 02 §2.9).

export type PoolEvents = {
  request: (request: WorkerRequest) => Promise<unknown>;
  progress: (rootId: string, chunk: { source: string; data: Json }) => void;
  syncEnded: (end: SyncEnd) => void;
  slotFreed: () => void;
};

export type PoolOptions = {
  size: number;
  concurrency: number;
  setup: Omit<WorkerSetup, 'checkPresetSettings' | 'mainArgv'>;
  logger: KernelLogger;
  events: PoolEvents;
};

export type WorkerPool = {
  summary: RegistrySummary;
  run(job: RootJob): Promise<unknown>;
  abort(jobId: string, reason: AbortReason): boolean;
  abortAll(reason: AbortReason): void;
  freeSlots(): number;
  idle(): Promise<void>;
  retire(): Promise<void>;
  close(): Promise<void>;
};

type Pending = { jobId: string; resolve: (output: unknown) => void; reject: (error: Error) => void };
type PoolWorker = { thread: Worker; running: Map<number, Pending>; exited: Promise<void>; stopAsked: boolean };
type Queued = { job: RootJob; pending: Pending };

// From source (development and tests) the worker is TypeScript and needs the source condition; built, it is JavaScript.
const fromSource = import.meta.url.endsWith('.ts');
const workerFile = new URL(fromSource ? './worker-main.ts' : './worker-main.js', import.meta.url);
const execArgv = fromSource ? ['--conditions=@kvman/source'] : [];

// Asks a worker to close its connection and exit, once, and resolves when it has.
function stopWorker(worker: PoolWorker): Promise<void> {
  if (!worker.stopAsked) {
    worker.stopAsked = true;
    worker.thread.postMessage({ kind: 'stop' });
  }
  return worker.exited;
}

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function startPool(options: PoolOptions): Promise<WorkerPool> {
  const workers: PoolWorker[] = [];
  const queue: Queued[] = [];
  let nextRequest = 0;
  let closing = false;
  let retiring = false;
  let idleWaiters: (() => void)[] = [];
  const retiredWaiters: (() => void)[] = [];

  const runningCount = (): number => workers.reduce((total, worker) => total + worker.running.size, 0);
  const checkIdle = (): void => {
    if (runningCount() > 0 || queue.length > 0) return;
    const waiters = idleWaiters;
    idleWaiters = [];
    for (const resolve of waiters) resolve();
  };

  const releaseIdle = (): void => {
    if (!retiring || queue.length > 0) return;
    for (const worker of workers) if (worker.running.size === 0) void stopWorker(worker);
  };

  const drain = (): void => {
    for (const worker of workers) {
      while (worker.running.size < options.concurrency && queue.length > 0) {
        const queued = queue.shift();
        if (queued === undefined) break;
        nextRequest += 1;
        worker.running.set(nextRequest, queued.pending);
        worker.thread.postMessage({ kind: 'run', requestId: nextRequest, job: queued.job });
      }
    }
  };

  const settle = (worker: PoolWorker, requestId: number, outcome: { output: unknown } | { problem: Problem }): void => {
    const pending = worker.running.get(requestId);
    worker.running.delete(requestId);
    if ('problem' in outcome) pending?.reject(new ProblemError(outcome.problem));
    else pending?.resolve(outcome.output);
    drain();
    options.events.slotFreed();
    checkIdle();
    releaseIdle();
  };

  const answer = (worker: PoolWorker, requestId: number, request: WorkerRequest): void => {
    options.events.request(request).then(
      (value) => worker.thread.postMessage({ kind: 'answer', requestId, value }),
      (error: unknown) => {
        const problem = error instanceof ProblemError ? error.problem : { code: 'HANDLER_FAILED', message: 'The kernel could not answer.' };
        if (!(error instanceof ProblemError)) options.logger.error('The kernel failed to answer a worker.', { kind: request.kind, reason: reason(error) });
        worker.thread.postMessage({ kind: 'answer', requestId, problem });
      },
    );
  };

  const receive = (worker: PoolWorker, message: ToMain): void => {
    if (message.kind === 'result') settle(worker, message.requestId, { output: message.output });
    else if (message.kind === 'problem') settle(worker, message.requestId, { problem: message.problem });
    else if (message.kind === 'request') answer(worker, message.requestId, message.request);
    else if (message.kind === 'progress') options.events.progress(message.rootId, message.chunk);
    else if (message.kind === 'sync-ended') options.events.syncEnded(message.end);
  };

  const failRunning = (worker: PoolWorker): void => {
    const problem = closing ? kernelProblem('INTERRUPTED', 'kvman stopped during the attempt.') : kernelProblem('WORKER_CRASHED', 'The worker running the job died.');
    for (const pending of worker.running.values()) pending.reject(problem);
    worker.running.clear();
  };

  const spawn = (checkPresetSettings: boolean): Promise<{ worker: PoolWorker; summary: RegistrySummary }> =>
    new Promise((resolve, reject) => {
      const thread = new Worker(workerFile, { workerData: { ...options.setup, checkPresetSettings, mainArgv: process.argv }, execArgv });
      const exited = new Promise<void>((resolveExit) => thread.once('exit', () => resolveExit()));
      const worker: PoolWorker = { thread, running: new Map(), exited, stopAsked: false };
      let ready = false;
      thread.on('message', (raw: unknown) => {
        const message = toMainSchema.parse(raw);
        if (message.kind === 'ready') {
          ready = true;
          workers.push(worker);
          resolve({ worker, summary: message.summary });
          drain();
          options.events.slotFreed();
          releaseIdle();
        } else if (message.kind === 'failed') {
          reject(new ProblemError(message.problem));
          void stopWorker(worker);
        } else receive(worker, message);
      });
      thread.on('error', (error) => options.logger.error('A worker thread failed.', { error: error.message, stack: error.stack ?? '' }));
      thread.on('exit', () => {
        if (!ready) {
          reject(kernelProblem('EXTENSION_INVALID', 'A worker stopped while loading the extensions.'));
          return;
        }
        workers.splice(workers.indexOf(worker), 1);
        failRunning(worker);
        options.events.slotFreed();
        checkIdle();
        if (retiring && workers.length === 0) {
          for (const resolve of retiredWaiters.splice(0)) resolve();
        } else if (!closing && !retiring) {
          spawn(false).catch((error: unknown) => options.logger.error('A replacement worker could not start.', { reason: reason(error) }));
        }
      });
    });

  const started = await Promise.allSettled(Array.from({ length: options.size }, (_, index) => spawn(index === 0)));
  const failure = started.find((result) => result.status === 'rejected');
  const first = started[0];
  if (failure !== undefined || first?.status !== 'fulfilled') {
    closing = true;
    await Promise.all(workers.map((worker) => stopWorker(worker)));
    const error: unknown = failure?.reason;
    throw error;
  }

  // A job still waiting for a slot never starts: it ends CANCELLED (or INTERRUPTED at shutdown), and a sync one
  // reports its end for the kernel's handler points, as its worker would have.
  const cancelQueued = (index: number, why: AbortReason): void => {
    const [queued] = queue.splice(index, 1);
    if (queued === undefined) return;
    const problem = why === 'cancel' ? kernelProblem('CANCELLED', 'The job was cancelled.') : kernelProblem('INTERRUPTED', 'kvman stopped during the attempt.');
    const { job } = queued;
    if (!job.async && !job.fromHandler && why === 'cancel') {
      const input = { jobId: job.id, rootId: job.id, name: job.name, caller: job.caller, workspaceId: job.workspace.id, reason: 'cancel' };
      options.events.syncEnded({ point: 'kernel.job.cancelled', input, workspaceId: job.workspace.id });
    }
    queued.pending.reject(problem);
    checkIdle();
  };

  const locate = (jobId: string): { worker: PoolWorker; requestId: number } | undefined => {
    for (const worker of workers) {
      for (const [requestId, pending] of worker.running) if (pending.jobId === jobId) return { worker, requestId };
    }
    return undefined;
  };

  return {
    summary: first.value.summary,
    run: (job) =>
      new Promise((resolve, reject) => {
        queue.push({ job, pending: { jobId: job.id, resolve, reject } });
        drain();
      }),
    abort: (jobId, why) => {
      const waiting = queue.findIndex((queued) => queued.job.id === jobId);
      if (waiting >= 0) {
        cancelQueued(waiting, why);
        return true;
      }
      const found = locate(jobId);
      if (found === undefined) return false;
      found.worker.thread.postMessage({ kind: 'abort', requestId: found.requestId, reason: why });
      return true;
    },
    abortAll: (why) => {
      for (const worker of workers) for (const requestId of worker.running.keys()) worker.thread.postMessage({ kind: 'abort', requestId, reason: why });
    },
    freeSlots: () => workers.length * options.concurrency - runningCount() - queue.length,
    idle: () => {
      const done = new Promise<void>((resolve) => idleWaiters.push(resolve));
      checkIdle();
      return done;
    },
    retire: () => {
      retiring = true;
      const retired = workers.length === 0 ? Promise.resolve() : new Promise<void>((resolve) => retiredWaiters.push(resolve));
      releaseIdle();
      return retired;
    },
    close: async () => {
      closing = true;
      await Promise.all(workers.map((worker) => stopWorker(worker)));
    },
  };
}

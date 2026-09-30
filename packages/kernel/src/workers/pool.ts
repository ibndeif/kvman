import { Worker } from 'node:worker_threads';
import { ProblemError, type Problem } from '@kvman/sdk';
import type { KernelLogger } from '../logging/logger.ts';
import { kernelProblem } from '../problems.ts';
import { toMainSchema, type RootJob, type SecretWrite, type ToWorker, type WorkerSetup } from './protocol.ts';

// The main thread's pool of worker threads (plan 02 §2.2). Each worker runs up to `concurrency` root jobs at once;
// nested sync calls run inside their root job and take no slot. A worker that dies fails its jobs `WORKER_CRASHED`,
// and a replacement takes its place.

export type PoolOptions = {
  size: number;
  concurrency: number;
  setup: Omit<WorkerSetup, 'checkPresetSettings'>;
  logger: KernelLogger;
  writeSecret: (write: SecretWrite) => void;
};

export type WorkerPool = { run(job: RootJob): Promise<unknown>; close(): Promise<void> };

type Pending = { resolve: (output: unknown) => void; reject: (error: Error) => void };
type PoolWorker = { thread: Worker; running: Map<number, Pending> };
type Queued = { job: RootJob; pending: Pending };

// From source (development and tests) the worker is TypeScript and needs the source condition; built, it is JavaScript.
const fromSource = import.meta.url.endsWith('.ts');
const workerFile = new URL(fromSource ? './worker-main.ts' : './worker-main.js', import.meta.url);
const execArgv = fromSource ? ['--conditions=@kvman/source'] : [];

export async function startPool(options: PoolOptions): Promise<WorkerPool> {
  const workers: PoolWorker[] = [];
  const queue: Queued[] = [];
  let nextRequest = 0;
  let closing = false;

  const post = (worker: PoolWorker, message: ToWorker): void => worker.thread.postMessage(message);

  const dispatch = (worker: PoolWorker, queued: Queued): void => {
    nextRequest += 1;
    worker.running.set(nextRequest, queued.pending);
    post(worker, { kind: 'run', requestId: nextRequest, job: queued.job });
  };

  const drain = (): void => {
    for (const worker of workers) {
      while (worker.running.size < options.concurrency && queue.length > 0) {
        const queued = queue.shift();
        if (queued !== undefined) dispatch(worker, queued);
      }
    }
  };

  const settle = (worker: PoolWorker, requestId: number, outcome: { output: unknown } | { problem: Problem }): void => {
    const pending = worker.running.get(requestId);
    worker.running.delete(requestId);
    if ('problem' in outcome) pending?.reject(new ProblemError(outcome.problem));
    else pending?.resolve(outcome.output);
    drain();
  };

  const answerSecretWrite = (worker: PoolWorker, requestId: number, write: SecretWrite): void => {
    try {
      options.writeSecret(write);
      post(worker, { kind: 'secret-written', requestId });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      options.logger.error('A secret could not be written.', { extension: write.extension, name: write.name, reason });
      post(worker, { kind: 'secret-written', requestId, problem: { code: 'HANDLER_FAILED', message: 'The secret could not be written.' } });
    }
  };

  const failRunning = (worker: PoolWorker): void => {
    const problem = closing
      ? kernelProblem('INTERRUPTED', 'kvman stopped during the attempt.')
      : kernelProblem('WORKER_CRASHED', 'The worker running the job died.');
    for (const pending of worker.running.values()) pending.reject(problem);
    worker.running.clear();
  };

  const spawn = (checkPresetSettings: boolean): Promise<PoolWorker> =>
    new Promise((resolve, reject) => {
      const thread = new Worker(workerFile, { workerData: { ...options.setup, checkPresetSettings }, execArgv });
      const worker: PoolWorker = { thread, running: new Map() };
      let ready = false;
      thread.on('message', (raw: unknown) => {
        const message = toMainSchema.parse(raw);
        if (message.kind === 'ready') {
          ready = true;
          workers.push(worker);
          resolve(worker);
          drain();
        } else if (message.kind === 'failed') {
          reject(new ProblemError(message.problem));
          void thread.terminate();
        } else if (message.kind === 'write-secret') answerSecretWrite(worker, message.requestId, message.write);
        else settle(worker, message.requestId, message.kind === 'result' ? { output: message.output } : { problem: message.problem });
      });
      thread.on('error', (error) => options.logger.error('A worker thread failed.', { error: error.message, stack: error.stack ?? '' }));
      thread.on('exit', () => {
        if (!ready) {
          reject(kernelProblem('EXTENSION_INVALID', 'A worker stopped while loading the extensions.'));
          return;
        }
        workers.splice(workers.indexOf(worker), 1);
        failRunning(worker);
        if (!closing) replace();
      });
    });

  const replace = (): void => {
    spawn(false).catch((error: unknown) => {
      const reason = error instanceof Error ? error.message : String(error);
      options.logger.error('A replacement worker could not start.', { reason });
    });
  };

  const started = await Promise.allSettled(Array.from({ length: options.size }, (_, index) => spawn(index === 0)));
  const failure = started.find((result) => result.status === 'rejected');
  if (failure !== undefined) {
    closing = true;
    await Promise.all(workers.map((worker) => worker.thread.terminate()));
    const reason: unknown = failure.reason;
    throw reason;
  }

  return {
    run: (job) =>
      new Promise((resolve, reject) => {
        queue.push({ job, pending: { resolve, reject } });
        drain();
      }),
    close: async () => {
      closing = true;
      await Promise.all(workers.map((worker) => worker.thread.terminate()));
    },
  };
}

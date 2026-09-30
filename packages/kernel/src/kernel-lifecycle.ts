import type { Job } from '@kvman/sdk';
import type { Dispatcher } from './jobs/dispatcher.ts';
import type { KernelLogger } from './logging/logger.ts';
import type { WorkerPool } from './workers/pool.ts';

// The parts of start and stop that run the kernel's lifecycle handlers (plan 02 §2.14, §2.15).

export const lifecycleBudgetMs = 10_000;

// Resolves when `work` does, or when the deadline passes (real time: the budget is about kvman's own wait).
function withinDeadline(work: Promise<unknown>, deadline: number): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, Math.max(0, deadline - Date.now()));
  });
  return Promise.race([work.then(() => undefined), late]).finally(() => clearTimeout(timer));
}

function logFailures(logger: KernelLogger, jobs: readonly Job[]): void {
  for (const job of jobs) {
    if (job.status === 'failed') logger.error('A kernel.started handler failed.', { jobId: job.id, code: job.problem?.code ?? '' });
  }
}

// `kernel.started` handlers run extension by extension in dependency order, within one budget; those still running
// when it ends keep running.
export async function runStartedHandlers(dispatcher: Dispatcher, logger: KernelLogger, extensionOrder: readonly string[], handlerExtensions: readonly string[]): Promise<void> {
  const deadline = Date.now() + lifecycleBudgetMs;
  for (const extension of extensionOrder.filter((name) => handlerExtensions.includes(name))) {
    const ids = dispatcher.deliverTo('kernel.started', extension, {}, 'home');
    const done = Promise.all(ids.map((id) => dispatcher.waitForJob(id))).then((jobs) => logFailures(logger, jobs));
    await withinDeadline(done, deadline);
    if (Date.now() >= deadline) return;
  }
}

// Ctrl+C (plan 02 §2.14): the stopping handlers run, running jobs are aborted, and kvman waits for them within one
// budget; then the workers stop, and attempts that didn't finish end INTERRUPTED.
export async function stopJobs(dispatcher: Dispatcher, pool: WorkerPool): Promise<void> {
  const deadline = Date.now() + lifecycleBudgetMs;
  dispatcher.setMode('stopping');
  const stopping = dispatcher.deliver('kernel.stopping', {}, 'home');
  await withinDeadline(Promise.all(stopping.map((id) => dispatcher.waitForJob(id))), deadline);
  pool.abortAll('shutdown');
  await withinDeadline(pool.idle(), deadline);
  dispatcher.setMode('stopped');
  await pool.close();
  await dispatcher.drained();
  dispatcher.dropQueued('kernel.stopping');
}

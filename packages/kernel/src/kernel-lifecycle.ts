import type { Job } from '@kvman/sdk';
import type { Dispatcher } from './jobs/dispatcher.ts';
import type { KernelLogger } from './logging/logger.ts';
import type { ProcessService } from './processes/process-service.ts';
import type { ExtensionRun } from './run/extension-run.ts';

// The parts of start, stop, and hot reload that run the kernel's lifecycle handlers (plan 02 §2.9, §2.14, §2.15).

export const lifecycleBudgetMs = 10_000;

// Resolves when `work` does, when the deadline passes (real time: the budget is about kvman's own wait), or when the
// kernel stops waiting.
function withinDeadline(work: Promise<unknown>, deadline: number, stopWaiting?: AbortSignal): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  let onAbort: (() => void) | undefined;
  const late = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, Math.max(0, deadline - Date.now()));
    onAbort = resolve;
    stopWaiting?.addEventListener('abort', onAbort, { once: true });
  });
  return Promise.race([work.then(() => undefined), late]).finally(() => {
    clearTimeout(timer);
    if (onAbort !== undefined) stopWaiting?.removeEventListener('abort', onAbort);
  });
}

function logFailures(logger: KernelLogger, jobs: readonly Job[]): void {
  for (const job of jobs) {
    if (job.status === 'failed') logger.error('A kernel.started handler failed.', { jobId: job.id, code: job.problem?.code ?? '' });
  }
}

// `kernel.started` handlers run extension by extension in dependency order, within one budget; those still running
// when it ends keep running.
export async function runStartedHandlers(
  dispatcher: Dispatcher,
  logger: KernelLogger,
  extensionOrder: readonly string[],
  handlerExtensions: readonly string[],
  stopWaiting?: AbortSignal,
): Promise<void> {
  const deadline = Date.now() + lifecycleBudgetMs;
  for (const extension of extensionOrder.filter((name) => handlerExtensions.includes(name))) {
    if (stopWaiting?.aborted === true) return;
    const ids = dispatcher.deliverTo('kernel.started', extension, {}, 'home');
    const done = Promise.all(ids.map((id) => dispatcher.waitForJob(id))).then((jobs) => logFailures(logger, jobs));
    await withinDeadline(done, deadline, stopWaiting);
    if (Date.now() >= deadline) return;
  }
}

// Ctrl+C (plan 02 §2.14): the stopping handlers run; running jobs are aborted and every process gets SIGTERM; kvman
// waits for both within one budget, kills the processes left, stops the workers, and attempts that didn't finish end
// INTERRUPTED.
export async function stopRun(dispatcher: Dispatcher, run: ExtensionRun, processes: ProcessService): Promise<void> {
  const deadline = Date.now() + lifecycleBudgetMs;
  dispatcher.setMode('stopping');
  const stopping = dispatcher.deliver('kernel.stopping', {}, 'home');
  await withinDeadline(Promise.all(stopping.map((id) => dispatcher.waitForJob(id))), deadline);
  run.abortAll('shutdown');
  processes.terminateAll();
  await withinDeadline(Promise.all([run.idle(), processes.exited()]), deadline);
  await processes.killAll();
  dispatcher.setMode('stopped');
  await run.close();
  await dispatcher.drained();
  dispatcher.dropQueued('kernel.stopping');
}

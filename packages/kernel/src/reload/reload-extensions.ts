import { ProblemError } from '@kvman/sdk';
import type { Dispatcher } from '../jobs/dispatcher.ts';
import { runStartedHandlers } from '../kernel-lifecycle.ts';
import type { KernelLogger } from '../logging/logger.ts';
import type { ExtensionRun, Reload } from '../run/extension-run.ts';

// One hot reload (plan 02 §2.9, ADR 0009, 26): the new pool takes the jobs, each reloaded extension is logged with its
// revision, and the `kernel.started` handlers of the reloaded extensions and their dependents run again. A reload that
// fails is logged, and the previous code keeps serving.
export async function reloadExtensions(run: ExtensionRun, dispatcher: Dispatcher, logger: KernelLogger, changed: ReadonlySet<string>, stopWaiting: AbortSignal): Promise<void> {
  let reload: Reload;
  try {
    reload = await run.reload(changed);
  } catch (error) {
    const code = error instanceof ProblemError ? error.problem.code : 'EXTENSION_INVALID';
    const reason = error instanceof Error ? error.message : String(error);
    for (const extension of changed) logger.error('extension reload failed', { extension, code, reason });
    return;
  }
  const pool = run.pool();
  dispatcher.attach(pool, pool.summary.handlers);
  for (const extension of reload.reloaded) logger.info('extension reloaded', { extension: extension.name, revision: extension.revision });
  const started = pool.summary.handlers.filter((handler) => handler.point === 'kernel.started').map((handler) => handler.extension);
  void runStartedHandlers(dispatcher, logger, reload.startedAgain, started, stopWaiting);
}

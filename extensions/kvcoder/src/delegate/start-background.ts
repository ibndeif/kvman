import { isDeepStrictEqual } from 'node:util';
import { ProblemError, type Ctx, type Stored } from '@kvman/sdk';
import { errorOutput } from '../connector-call.ts';
import type { RunDoc } from '../schemas/records.ts';
import { now } from '../sessions/session-lookup.ts';
import { txRecords, type TxRecords } from '../store/collections.ts';
import type { CreationGuard } from './permission.ts';
import { launchRun } from './runs.ts';

/** Local proof for this newly created attempt only, not a durable/background-origin launch permit. */
export async function startBackgroundRun(ctx: Ctx, run: Stored<RunDoc>, prepare: () => Promise<CreationGuard>, current: (store: TxRecords) => boolean): Promise<void> {
  let dispatchEligible = false;
  try {
    const guard = await prepare();
    await launchRun(ctx, run.id, store => {
      const parent = guard(store);
      dispatchEligible = true;
      return parent;
    });
  } catch (error) {
    if (!(error instanceof ProblemError) || ctx.job.signal.aborted) throw error;
    // After guard success, an enqueue error could have unknown effects: never infer "unstarted" from jobId:null.
    if (!dispatchEligible) await ctx.store.transaction(tx => {
      const store = txRecords(tx);
      if (current(store) && run.jobId === null && isDeepStrictEqual(store.runs.get(run.id), run)) {
        store.runs.update(run.id, { status: 'failed', endedAt: now(), output: errorOutput(error.problem).output });
      }
    });
    throw error;
  }
}

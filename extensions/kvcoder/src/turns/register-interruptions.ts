import type { Ctx } from '@kvman/sdk';
import { runLost } from '../delegate/register-worker-run.ts';
import { records, txRecords } from '../store/collections.ts';
import { notifyEnded } from './end-turn.ts';
import { interruptUncertain, preparedRecovery, recoveryState } from './recovery-state.ts';

// Steps that end without finishing (plan 08 §8.1, ADR 0009, 95): a step cut off by a stop, a crash, or a timeout ends
// its turn with a notice. These handlers queue nothing, since their jobs carry the `fromHandler` mark.

async function stepEnded(ctx: Ctx, jobId: string, code: string): Promise<void> {
  const [session] = await records(ctx.store).sessions.find({ stepJobId: jobId }, { limit: 1 });
  if (session === undefined) return;
  const ended = await ctx.store.transaction(tx => {
    ctx.job.signal.throwIfAborted();
    const store = txRecords(tx), state = recoveryState(store, session.id);
    if (state?.session.stepJobId !== jobId) return undefined;
    // A modern prepared job never claimed effects. Keep its recoverable intent instead of ending it.
    if (preparedRecovery(state)) return undefined;
    return interruptUncertain(store, state, code);
  });
  if (ended !== undefined) await notifyEnded(ctx, ended);
}

export function registerInterruptions(ctx: Ctx): void {
  ctx.registerHandler('kernel.job.failed', {
    description: "Ends the turn of a step that failed, or of a program worker's run that was lost.",
    handle: async ({ jobId, name, problem }) => {
      if (name === 'kvcoder.delegate.worker.run') await runLost(ctx, jobId, problem.code);
      if (name === 'kvcoder.turn.step') await stepEnded(ctx, jobId, problem.code);
    },
  });
  ctx.registerHandler('kernel.job.cancelled', {
    description: 'Ends the turn of a cancelled step.',
    handle: async ({ jobId, name }) => {
      if (name === 'kvcoder.turn.step') await stepEnded(ctx, jobId, 'CANCELLED');
    },
  });
}

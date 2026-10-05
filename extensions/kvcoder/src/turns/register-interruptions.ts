import type { Ctx } from '@kvman/sdk';
import { records } from '../store/collections.ts';
import { endTurn } from './end-turn.ts';

// Steps that end without finishing (plan 08 §8.1, ADR 0009, 95): a step cut off by a stop, a crash, or a timeout ends
// its turn with a notice. These handlers queue nothing, since their jobs carry the `fromHandler` mark.

async function stepEnded(ctx: Ctx, jobId: string, outcome: 'interrupted' | 'failed' | 'cancelled', code: string): Promise<void> {
  const [session] = await records(ctx.store).sessions.find({ stepJobId: jobId }, { limit: 1 });
  if (session === undefined || session.turnId === null) return;
  const notice = outcome === 'cancelled' ? { code: 'CANCELLED' } : { code: outcome === 'interrupted' ? 'INTERRUPTED' : 'STEP_FAILED', params: { code } };
  await endTurn(ctx, session.id, session.turnId, outcome, 'handler', notice);
}

export function registerInterruptions(ctx: Ctx): void {
  ctx.registerHandler('kernel.job.failed', {
    description: 'Ends the turn of a step that failed.',
    handle: async ({ jobId, name, problem }) => {
      if (name === 'kvcoder.turn.step') await stepEnded(ctx, jobId, problem.code === 'INTERRUPTED' ? 'interrupted' : 'failed', problem.code);
    },
  });
  ctx.registerHandler('kernel.job.cancelled', {
    description: 'Ends the turn of a cancelled step.',
    handle: async ({ jobId, name }) => {
      if (name === 'kvcoder.turn.step') await stepEnded(ctx, jobId, 'cancelled', 'CANCELLED');
    },
  });
}

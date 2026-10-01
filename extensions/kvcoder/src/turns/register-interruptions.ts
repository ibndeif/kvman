import type { Ctx } from '@kvman/sdk';
import { resultText } from '../connector-line.ts';
import { records } from '../store/collections.ts';
import { appendBackground, backgroundText } from './background.ts';
import { endTurn } from './end-turn.ts';

// Steps and background jobs that end without finishing (plan 08 §8.1, ADR 0009, 95): a step cut off by a stop, a crash,
// or a timeout ends its turn with a notice; a background connector job that fails or is cancelled reports back. These
// handlers queue nothing, since their jobs carry the `fromHandler` mark.

async function stepEnded(ctx: Ctx, jobId: string, outcome: 'interrupted' | 'failed' | 'cancelled', code: string): Promise<void> {
  const [session] = await records(ctx.store).sessions.find({ stepJobId: jobId }, { limit: 1 });
  if (session === undefined || session.turnId === null) return;
  const notice = outcome === 'cancelled' ? { code: 'CANCELLED' } : { code: outcome === 'interrupted' ? 'INTERRUPTED' : 'STEP_FAILED', params: { code } };
  await endTurn(ctx, session.id, session.turnId, outcome, 'handler', notice);
}

async function backgroundEnded(ctx: Ctx, jobId: string, text: string): Promise<void> {
  const [entry] = await records(ctx.store).background.find({ ref: jobId }, { limit: 1 });
  if (entry === undefined) return;
  await appendBackground(ctx, entry.sessionId, { kind: 'job', jobId }, backgroundText(entry.call, jobId, text), false);
}

export function registerInterruptions(ctx: Ctx): void {
  ctx.registerHandler('kernel.job.failed', {
    description: "Ends the turn of a step that failed, and reports a failed background connector job.",
    handle: async ({ jobId, name, problem }) => {
      if (name === 'kvcoder.turn.step') await stepEnded(ctx, jobId, problem.code === 'INTERRUPTED' ? 'interrupted' : 'failed', problem.code);
      if (name === 'kvcoder.connector.run') await backgroundEnded(ctx, jobId, resultText(`error ${problem.code}: ${problem.message}`, 1));
    },
  });
  ctx.registerHandler('kernel.job.cancelled', {
    description: 'Ends the turn of a cancelled step, and reports a cancelled background connector job.',
    handle: async ({ jobId, name }) => {
      if (name === 'kvcoder.turn.step') await stepEnded(ctx, jobId, 'cancelled', 'CANCELLED');
      if (name === 'kvcoder.connector.run') await backgroundEnded(ctx, jobId, resultText('error CANCELLED: The job was cancelled.', 1));
    },
  });
}

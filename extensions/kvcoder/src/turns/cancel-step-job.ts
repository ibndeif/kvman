import { ProblemError, type Ctx, type Job } from '@kvman/sdk';
import type { EndedTurn } from './end-turn-state.ts';
import { stepInputSchema } from './step-claim.ts';
import type { StepIdentity } from './step-intents.ts';

export type StepOwner = { sessionId: string; turnId: string; jobId: string | null; identity: StepIdentity | undefined };

/** Stopping owned work is not a replay permit; attempts/status cannot replace its immutable binding. */
export function ownsStepJob(job: Job, workspaceId: string, expected: StepOwner): boolean {
  if (job.id !== expected.jobId || job.name !== 'kvcoder.turn.step' || job.workspaceId !== workspaceId) return false;
  const input = stepInputSchema.safeParse(job.input);
  if (!input.success || input.data.sessionId !== expected.sessionId || input.data.turnId !== expected.turnId) return false;
  if (!('intentId' in input.data)) return true;
  const identity = expected.identity;
  return identity !== undefined && identity.sessionId === expected.sessionId && identity.turnId === expected.turnId && input.data.intentId === identity.intentId && input.data.generation === identity.generation;
}

/** Verify AFTER terminal ownership capture; never trust a saved legacy or malformed pointer alone. */
export async function cancelStepJob(ctx: Ctx, ended: EndedTurn): Promise<void> {
  if (ended.stepJobId === null) return;
  let job: Job;
  try {
    job = await ctx.exec('kernel.jobs.get', { id: ended.stepJobId });
  } catch (error) {
    ctx.job.signal.throwIfAborted();
    if (error instanceof ProblemError && error.problem.code === 'NOT_FOUND') return;
    throw error;
  }
  ctx.job.signal.throwIfAborted();
  if (ownsStepJob(job, ctx.job.workspace.id, { sessionId: ended.session.id, turnId: ended.turnId, jobId: ended.stepJobId, identity: ended.stepIdentity })) await ctx.cancel(job.id);
  else ctx.log.warn('A saved step job was not cancelled because ownership could not be verified.', { code: 'STEP_OWNERSHIP_UNCONFIRMED' });
}

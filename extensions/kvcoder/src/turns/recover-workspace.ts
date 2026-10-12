import { ProblemError, type Ctx, type Job } from '@kvman/sdk';
import { records, txRecords } from '../store/collections.ts';
import { notifyEnded } from './end-turn.ts';
import { boundRecoveryIntent, interruptUncertain, preparedRecovery, recoveryJobId, recoveryState, retryPrepared, type RecoveryState } from './recovery-state.ts';
import { dispatchStep } from './start-turn.ts';
import { stepInputSchema } from './step-claim.ts';

/** Exact immutable binding, not a bounded jobs.list result or evidence from schema defaults. */
export function recoveryJobMatches(state: RecoveryState, job: Job, workspaceId: string): boolean {
  if (state.session.stepIntentId !== null && !boundRecoveryIntent(state)) return false;
  const expectedId = recoveryJobId(state);
  if (job.id !== expectedId || job.name !== 'kvcoder.turn.step' || job.workspaceId !== workspaceId || job.retries !== 0) return false;
  if (job.status === 'queued' ? job.attempts !== 0 || state.intent?.phase === 'claimed' : job.status !== 'running' || job.attempts !== 1) return false;
  const parsed = stepInputSchema.safeParse(job.input);
  if (!parsed.success || parsed.data.sessionId !== state.session.id || parsed.data.turnId !== state.turn.id) return false;
  if (state.intent !== undefined && state.session.stepJobId !== state.intent.jobId) return false;
  if ('intentId' in parsed.data) return state.intent !== undefined && state.intent.legacyJobId === null && parsed.data.intentId === state.intent.id && parsed.data.generation === state.intent.generation;
  return state.session.stepIntentId === null || (state.intent?.phase === 'claimed' && state.intent.legacyJobId === job.id);
}

async function knownJob(ctx: Ctx, id: string | null): Promise<Job | undefined> {
  if (id === null) return undefined;
  try {
    const job = await ctx.exec('kernel.jobs.get', { id });
    ctx.job.signal.throwIfAborted();
    return job;
  } catch (error) {
    ctx.job.signal.throwIfAborted();
    if (error instanceof ProblemError && error.problem.code === 'NOT_FOUND') return undefined;
    throw error;
  }
}

/** Inspection never claims. SQLite decisions revalidate the snapshot after metadata awaits. */
export async function recoverSession(ctx: Ctx, sessionId: string, dispatch = true): Promise<void> {
  ctx.job.signal.throwIfAborted();
  const state = await ctx.store.transaction(tx => {
    ctx.job.signal.throwIfAborted();
    return recoveryState(txRecords(tx), sessionId);
  });
  if (state === undefined) return;
  const job = await knownJob(ctx, recoveryJobId(state));
  if (job !== undefined && recoveryJobMatches(state, job, ctx.job.workspace.id)) return;
  const result = await ctx.store.transaction(tx => {
    ctx.job.signal.throwIfAborted();
    const store = txRecords(tx);
    if (preparedRecovery(state)) return { step: retryPrepared(store, state) };
    return { ended: interruptUncertain(store, state, job?.problem?.code ?? 'STEP_EFFECTS_UNKNOWN') };
  });
  if ('step' in result && result.step !== undefined && dispatch) await dispatchStep(ctx, result.step, false);
  if ('ended' in result && result.ended !== undefined) await notifyEnded(ctx, result.ended);
}

/** Positive authorized send/answer only. Stop/delete/injection/handlers never call this dispatcher. */
export async function recoverWorkspace(ctx: Ctx, deferSessionId?: string): Promise<void> {
  let after: string | undefined;
  for (;;) {
    ctx.job.signal.throwIfAborted();
    const page = await records(ctx.store).sessions.find({}, { limit: 1000, ...(after === undefined ? {} : { after }) });
    for (const session of page) {
      if (session.status === 'running') await recoverSession(ctx, session.id, session.id !== deferSessionId);
    }
    if (page.length < 1000) return;
    after = page[page.length - 1]?.id;
  }
}

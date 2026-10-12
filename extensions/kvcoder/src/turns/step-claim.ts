import { ProblemError, z, type Ctx, type Job } from '@kvman/sdk';
import { txRecords } from '../store/collections.ts';
import { claimStep, liveStep, prepareStep, type StepIdentity } from './step-intents.ts';

const legacyStepInputSchema = z.strictObject({ sessionId: z.string(), turnId: z.string() });
const modernStepInputSchema = z.strictObject({
  sessionId: z.string(),
  turnId: z.string(),
  intentId: z.string(),
  generation: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
});

/** Private command input only: old jobs retain their actual two-field input, without defaults. */
export const stepInputSchema = z.union([modernStepInputSchema, legacyStepInputSchema]);
export type StepInput = z.output<typeof stepInputSchema>;
type LegacyStepInput = z.output<typeof legacyStepInputSchema>;

/** Internal execution authority, not a change to any public session/turn DTO. */
export type StepLease = StepIdentity & { jobId: string };

/**
 * Conservative compatibility proof for a currently executing old job. The kernel increments attempts
 * before invoking the handler; old stepOptions used retries: 0. Attempt 1 therefore excludes an earlier
 * kernel invocation, assuming immutable job name/workspace/input and no out-of-kernel execution.
 * This does not certify effects of missing, terminal, requeued or merely default-generation records.
 */
export function isLegacyStepJob(job: Job, input: LegacyStepInput, currentJobId: string, workspaceId: string): boolean {
  if (job.id !== currentJobId || job.name !== 'kvcoder.turn.step' || job.workspaceId !== workspaceId || job.status !== 'running' || job.attempts !== 1 || job.retries !== 0) return false;
  const saved = legacyStepInputSchema.safeParse(job.input);
  return saved.success && saved.data.sessionId === input.sessionId && saved.data.turnId === input.turnId;
}

/** Recheck authority after async preparation and immediately before effects; writes still recheck in their own tx. */
export async function currentStep(ctx: Ctx, lease: StepLease) {
  ctx.job.signal.throwIfAborted();
  if (ctx.job.id !== lease.jobId) return undefined;
  return ctx.store.transaction(tx => {
    ctx.job.signal.throwIfAborted();
    return liveStep(txRecords(tx), lease, lease.jobId);
  });
}

/** Claim before any approval, model or tool effects; no enqueue/cancel/effects in this transaction. */
export async function claimStepInput(ctx: Ctx, input: StepInput): Promise<StepLease | undefined> {
  const { id: jobId, signal, workspace } = ctx.job;
  signal.throwIfAborted();

  if ('intentId' in input) {
    return ctx.store.transaction(tx => {
      signal.throwIfAborted();
      return claimStep(txRecords(tx), input, jobId) === undefined ? undefined : { ...input, jobId };
    });
  }

  // jobs.get is cross-workspace. Never substitute the session's saved id for this executing job's id.
  let job: Job;
  try {
    job = await ctx.exec('kernel.jobs.get', { id: jobId });
  } catch (error) {
    signal.throwIfAborted();
    if (error instanceof ProblemError && error.problem.code === 'NOT_FOUND') return undefined;
    throw error;
  }
  signal.throwIfAborted();
  if (!isLegacyStepJob(job, input, jobId, workspace.id)) return undefined;

  return ctx.store.transaction(tx => {
    signal.throwIfAborted();
    const store = txRecords(tx);
    const session = store.sessions.get(input.sessionId);
    const turn = store.turns.get(input.turnId);
    if (session?.status !== 'running' || session.turnId !== input.turnId || session.stepJobId !== jobId || session.stepIntentId !== null || turn?.sessionId !== input.sessionId || turn.outcome !== null || turn.endedAt !== null || turn.pending.length !== 0) return undefined;
    // A legacy read's generation 0/null defaults are not permission: the saved job binding and
    // first-invocation metadata above are required, and all mutable state is checked in this same tx.
    const identity = prepareStep(store, input.sessionId, input.turnId, jobId);
    return claimStep(store, identity, jobId) === undefined ? undefined : { ...identity, jobId };
  });
}

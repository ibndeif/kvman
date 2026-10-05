import { ProblemError, type Ctx } from '@kvman/sdk';
import { delegateRunSchema } from '../connectors/delegate.ts';
import { errorOutput } from '../connector-call.ts';
import { firePoint } from '../registry/session-points.ts';
import type { RunCallDoc } from '../schemas/records.ts';
import { records, txRecords } from '../store/collections.ts';
import { heldText, resolvePending } from '../turns/resolve.ts';
import { createRun, dropRun, launchRun } from './runs.ts';
import { availableWorker, isProgram } from './workers.ts';

// A `delegate run` the person allowed (ADR 0021, 36). The run starts here, in the answer's own job, and the pending
// approval becomes a pending run, so the turn keeps waiting; a background run returns its id instead. A worker that
// is gone or changed by now gives the call an error result.

type Approved = { sessionId: string; toolCallId: string; call: RunCallDoc };

/** Whether an approved call is a worker's run, which never runs as a held call does. */
export const isDelegateRun = (call: RunCallDoc): boolean => call.connector === 'delegate' && call.command === 'run';

async function refuse(ctx: Ctx, approved: Approved, error: unknown): Promise<string | null> {
  if (!(error instanceof ProblemError)) throw error;
  return resolvePending(ctx, approved.sessionId, approved.toolCallId, heldText(approved.toolCallId, errorOutput(error.problem).output, true), false);
}

/** Starts the run of an approved call; resolves to the next step's job id when the call got its result at once and nothing else is pending. */
export async function startApprovedRun(ctx: Ctx, approved: Approved): Promise<string | null> {
  const { sessionId, toolCallId, call } = approved;
  const payload = delegateRunSchema.parse(call.payload);
  const session = await records(ctx.store).sessions.get(sessionId);
  let worker;
  try {
    worker = await availableWorker(ctx, session?.checks ?? null, payload.worker);
    if (!isProgram(worker)) throw new ProblemError({ code: 'VALIDATION_FAILED', message: `The worker ${worker.name} changed while the call waited. Make the call again.`, params: { worker: worker.name } });
  } catch (error) {
    return refuse(ctx, approved, error);
  }
  const background = payload.background === true;
  const run = await createRun(ctx, sessionId, worker, { description: call.description, task: payload.task }, background ? null : toolCallId);
  if (background) {
    await launchRun(ctx, run.id);
    const text = `started ${run.id}`;
    return resolvePending(ctx, sessionId, toolCallId, { toolCallId, text, isError: false, run: null, details: { description: call.description, connector: call.connector, command: call.command, output: text, durationMs: 0 } }, false);
  }
  const waiting = await ctx.store.transaction((tx) => {
    const store = txRecords(tx);
    const current = store.sessions.get(sessionId);
    const turn = current === undefined || current.turnId === null ? undefined : store.turns.get(current.turnId);
    if (turn === undefined || !turn.pending.some((item) => item.toolCallId === toolCallId)) return false;
    store.turns.update(turn.id, { pending: turn.pending.map((item) => (item.toolCallId === toolCallId ? { toolCallId, kind: 'worker' as const, questionId: null, question: null, childSessionId: null, runId: run.id } : item)) });
    return true;
  });
  if (!waiting) {
    await dropRun(ctx, run);
    return null;
  }
  await launchRun(ctx, run.id);
  await firePoint(ctx, 'kvcoder.session.waiting', { sessionId, kind: 'worker' });
  return null;
}

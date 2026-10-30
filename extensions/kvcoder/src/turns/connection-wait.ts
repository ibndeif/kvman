import { z, type Ctx, type Stored } from '@kvman/sdk';
import type { JsonValue } from '../connector-call.ts';
import type { SessionDoc } from '../schemas/records.ts';
import { now } from '../sessions/session-lookup.ts';
import { txRecords } from '../store/collections.ts';
import { appendNotice } from './history.ts';
import { dispatchStep } from './start-turn.ts';
import type { StepLease } from './step-claim.ts';
import { liveStep, prepareStep, settleStep } from './step-intents.ts';

// A turn whose model call still fails for a temporary reason after its tries waits for the connection (plan 08 §8.1,
// ADR 0108, 15): the notice CONNECTION_WAITING once, and a schedule that runs the step again every 2 minutes, 30 times
// at most (an hour), counted on the turn, so the wait needs no clock of its own. A message from the person, or Stop,
// ends the wait at once; a scheduled try then finds the turn no longer waiting and does nothing.

/** The scheduled tries at most, one every 2 minutes. */
export const connectionTries = 30;
const tryEveryMs = 120_000;

const resumeInput = z.object({ sessionId: z.string(), turnId: z.string() });

/** Whether the turn has used every try, so a failure ends it as before. */
export const triesUsed = (waits: number): boolean => waits >= connectionTries;

/** Settles the step as waiting for the connection, and schedules its next try. */
export async function waitForConnection(ctx: Ctx, session: Stored<SessionDoc>, lease: StepLease, params: Record<string, JsonValue>): Promise<void> {
  const waiting = await ctx.store.transaction((tx) => {
    ctx.job.signal.throwIfAborted();
    const store = txRecords(tx);
    const live = liveStep(store, lease, lease.jobId);
    if (live === undefined) return false;
    if (live.turn.connectionWaits === 0) appendNotice(store, live.session, 'CONNECTION_WAITING', params, lease.turnId);
    store.turns.update(lease.turnId, { connectionWaits: live.turn.connectionWaits + 1 });
    settleStep(store, lease, lease.jobId);
    store.sessions.update(session.id, { status: 'waiting', stepJobId: null, stepIntentId: null, updatedAt: now() });
    return true;
  });
  if (waiting) await ctx.schedule('kvcoder.turn.resume', { sessionId: session.id, turnId: lease.turnId }, { at: new Date(Date.now() + tryEveryMs), key: `connection-${session.id}` });
}

export function registerConnectionResume(ctx: Ctx): void {
  ctx.registerCommand('kvcoder.turn.resume', {
    description: 'Runs again the step of a turn that waits for the connection.',
    input: resumeInput,
    output: z.object({}),
    handle: async ({ sessionId, turnId }) => {
      const identity = await ctx.store.transaction((tx) => {
        const store = txRecords(tx);
        const session = store.sessions.get(sessionId);
        const turn = store.turns.get(turnId);
        if (session?.turnId !== turnId || session.status !== 'waiting' || turn?.outcome !== null || turn.pending.length > 0 || turn.connectionWaits === 0) return undefined;
        store.sessions.update(sessionId, { status: 'running', updatedAt: now() });
        return prepareStep(store, sessionId, turnId);
      });
      if (identity !== undefined) await dispatchStep(ctx, identity, true);
      return {};
    },
  });
}

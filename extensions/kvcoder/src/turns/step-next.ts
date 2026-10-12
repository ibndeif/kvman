import type { Ctx } from '@kvman/sdk';
import type { TxRecords } from '../store/collections.ts';
import { notifyEnded } from './end-turn.ts';
import { endTurnState, type EndedTurn } from './end-turn-state.ts';
import { dispatchStep } from './start-turn.ts';
import type { StepLease } from './step-claim.ts';
import { liveStep, prepareStep, settleStep, type StepIdentity } from './step-intents.ts';

export type StepNext = { kind: 'step'; identity: StepIdentity } | { kind: 'end'; ended: EndedTurn } | undefined;

/** Called in the SAME transaction as the step's results/inbox decision (ADR0041). */
export function advanceStep(store: TxRecords, lease: StepLease, maxSteps: number | null): StepNext {
  const live = liveStep(store, lease, lease.jobId);
  if (live === undefined) return undefined;
  if (maxSteps !== null && live.turn.steps >= maxSteps) {
    const ended = endTurnState(store, lease.sessionId, lease.turnId, 'maxSteps', 'step', { code: 'MAX_STEPS', params: { steps: maxSteps } }, lease);
    return ended === undefined ? undefined : { kind: 'end', ended };
  }
  if (!settleStep(store, lease, lease.jobId)) return undefined;
  return { kind: 'step', identity: prepareStep(store, lease.sessionId, lease.turnId) };
}

/** Dispatch and notifications happen only after their state transaction has committed. */
export async function dispatchNext(ctx: Ctx, next: StepNext): Promise<void> {
  if (next?.kind === 'step') await dispatchStep(ctx, next.identity, true);
  else if (next?.kind === 'end') await notifyEnded(ctx, next.ended);
}

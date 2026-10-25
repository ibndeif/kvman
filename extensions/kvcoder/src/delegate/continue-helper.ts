import { z, type Ctx, type Stored } from '@kvman/sdk';
import { callInput } from '../connectors/connector-command.ts';
import { delegateCommands, delegateContinueSchema, type DelegateContinue } from '../connectors/delegate.ts';
import { invalid } from '../problems.ts';
import type { SessionDoc } from '../schemas/records.ts';
import { now } from '../sessions/session-lookup.ts';
import { records, txRecords } from '../store/collections.ts';
import { appendMessage, userContent } from '../turns/history.ts';
import { liveStep } from '../turns/step-intents.ts';
import type { StepLease } from '../turns/step-claim.ts';
import type { CreationGuard } from './permission.ts';
import { availableWorker, isProgram, type SubagentWorker } from './workers.ts';

// `delegate continue` (plan 08 §8.5, ADR 0085, 4): a follow-up to a subagent helper of this chat, which goes on with its
// own history, worker, instructions, model, and thinking; to a helper still working, the message waits for its next step,
// as a person's message steers a running chat (ADR 0102, 11). Its check refuses what can't be continued.

/** The helper `id` of the chat, with its worker as the list has it now; a Problem for anything else. */
export async function continuableHelper(ctx: Ctx, sessionId: string, id: string): Promise<{ child: Stored<SessionDoc>; worker: SubagentWorker }> {
  const store = records(ctx.store);
  const run = await store.runs.get(id);
  if (run?.sessionId === sessionId) throw invalid(`${id} is a program worker's run; only a subagent helper can be continued.`, { id });
  const [parent, child] = await Promise.all([store.sessions.get(sessionId), store.sessions.get(id)]);
  if (child?.parentId !== sessionId || child.worker === null) throw ctx.problem('kvcoder/JOB_NOT_FOUND', { sessionId, id });
  const worker = await availableWorker(ctx, parent?.checks ?? null, child.worker.name);
  if (isProgram(worker)) throw invalid(`${id} is a program worker's run; only a subagent helper can be continued.`, { id });
  return { child, worker };
}

export function registerContinueCheck(ctx: Ctx): void {
  ctx.registerCommand('kvcoder.delegate.continue.check', {
    description: delegateCommands.continue.description,
    input: callInput(delegateContinueSchema),
    output: z.object({}),
    retries: 0,
    handle: async ({ sessionId, payload }) => {
      await continuableHelper(ctx, sessionId, payload.id);
      return {};
    },
  });
}

/** What became of a message to a helper: given to it for a new turn, queued for its running turn, or nothing (the step isn't current). */
export type Messaged = 'sent' | 'queued' | 'stale';

/**
 * Gives the helper its message, in the transaction that checks the originating step and the grants again; with
 * `background`, the chat also records it as a background run, or starts the record over when it already has one. A
 * helper still working gets it queued for its next step, and nothing else changes.
 */
export async function messageHelper(ctx: Ctx, lease: StepLease, request: DelegateContinue, guard: CreationGuard): Promise<Messaged> {
  return ctx.store.transaction((tx) => {
    const store = txRecords(tx);
    const parent = guard(store);
    const child = store.sessions.get(request.id);
    if (child?.parentId !== parent.id) throw invalid(`The helper ${request.id} can no longer be continued.`, { id: request.id });
    if (liveStep(store, lease, lease.jobId) === undefined) return 'stale';
    if (child.status !== 'idle' || child.turnId !== null) {
      store.queued.insert({ sessionId: child.id, source: { kind: 'subagent', sessionId: parent.id }, text: request.message, fileIds: null, fileNames: null, createdAt: now() });
      return 'queued';
    }
    if (request.background === true) {
      const [entry] = store.background.find({ sessionId: parent.id, ref: child.id }, { limit: 1 });
      if (entry === undefined) store.background.insert({ sessionId: parent.id, ref: child.id, kind: 'subagent', call: child.title, startedAt: now() });
      else store.background.update(entry.id, { startedAt: now() });
    }
    appendMessage(store, child, { kind: 'user', content: userContent(request.message), source: { kind: 'subagent', sessionId: parent.id } });
    return 'sent';
  });
}

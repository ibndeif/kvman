import { z, type Ctx, type Stored } from '@kvman/sdk';
import { availableWorker, workerCheckName, type SubagentWorker, type Worker } from '../delegate/workers.ts';
import { firePoint } from '../registry/session-points.ts';
import { invalid } from '../problems.ts';
import { settingSchemas } from '../register-settings.ts';
import type { CreationGuard } from '../delegate/permission.ts';
import type { SessionDoc } from '../schemas/records.ts';
import { now } from '../sessions/session-lookup.ts';
import { records, txRecords, type TxRecords } from '../store/collections.ts';
import { appendMessage, noUsage, userContent } from '../turns/history.ts';
import { modelInfo } from '../turns/model-info.ts';
import { cappedLevel, nearestLevel } from '../thinking-levels.ts';
import { beginTurn, openTurn } from '../turns/start-turn.ts';
import { callInput, type ConnectorCommand } from './connector-command.ts';
import { checkedFiles, delegateRunSchema } from '../delegate/brief.ts';
import type { RunBrief } from '../schemas/delegate-brief.ts';
export { delegateRunSchema, type DelegateRun } from '../delegate/brief.ts';

// The `delegate` connector (plan 08 §8.5, ADR 0021; ADR 0108, 1 and 2): a run of one deliverable handed to a worker,
// always in the background. A subagent worker runs it in a hidden child session that starts from the brief kvcoder
// writes, with the worker's instructions, connectors, model, and thinking; a child never has `delegate` or `ask`. A
// program worker's run is in `src/delegate/`. The check validates the payload, the worker, and the paths as a kernel
// job, and the step then starts the child (ADR 0011, 9).

/** What the prompt's index says the connector is for; the session's entry adds its workers. */
export const delegateDescription =
  "Hand one deliverable to a worker: a helper agent that works on it alone. Every run goes on in the background: the call returns at once, you go on with what doesn't need it or end your turn, and its answer comes as a message that wakes you; never wait for a helper with background wait. Delegate find, check, and review runs, and change runs only when two or more run at once on files that don't overlap; not a question, a small change, or work you already hold the context for.";

// A read-only worker says so, so the lead hands it no change to make (ADR 0085, 9).
const readOnlyNote = (worker: Worker): string => (worker.kind === 'subagent' && worker.readOnly ? '; read-only' : '');

/** The connector's description with the available workers, as the prompt's index shows it (ADR 0021, 1). */
export function delegateIndexDescription(workers: readonly Worker[]): string {
  return `${delegateDescription} Workers: ${workers.map((worker) => `${worker.name} (${worker.description.replace(/[.\s]+$/, '')}${readOnlyNote(worker)})`).join(', ')}.`;
}

const titleShown = 60;

// A helper's name as the person sees it: a title over 60 characters keeps its first 59 and an ellipsis (ADR 0051, 4).
const shownTitle = (title: string): string => (title.length > titleShown ? `${title.slice(0, titleShown - 1)}…` : title);

export const delegateContinueSchema = z.strictObject({
  id: z.string().min(1).describe('The helper to continue: the id in the line (helper <id>) under its result.'),
  message: z.string().min(1).describe('What the helper is to do next; it still has its brief and everything it did.'),
});

export const delegateCommands = {
  run: { registration: 'kvcoder.delegate.check', description: 'Starts a worker on one deliverable in the background; several runs in one reply run in parallel.', payload: delegateRunSchema, asks: false, result: 'started <id>; the answer comes as a message.' },
  continue: { registration: 'kvcoder.delegate.continue.check', description: 'Sends a follow-up to a helper of this chat, such as one that came back blocked or with questions: it continues with its own history, in the background.', payload: delegateContinueSchema, asks: false, result: 'started <id>, or queued for a helper still working; the answer comes as a message.' },
} satisfies Record<string, ConnectorCommand>;

export type DelegateContinue = z.output<typeof delegateContinueSchema>;


export function registerDelegateConnector(ctx: Ctx): void {
  ctx.registerCommand('kvcoder.delegate.check', {
    description: delegateCommands.run.description,
    input: callInput(delegateRunSchema),
    output: z.object({}),
    retries: 0,
    handle: async ({ sessionId, payload }) => {
      const session = await records(ctx.store).sessions.get(sessionId);
      const worker = await availableWorker(ctx, session?.checks ?? null, payload.worker);
      // A read-only worker changes nothing, so it takes no change run (ADR 0108, 2).
      if (payload.kind === 'change' && worker.kind === 'subagent' && worker.readOnly) throw invalid(`The worker ${worker.name} is read-only, so it takes no change run.`, { worker: worker.name });
      await checkedFiles(ctx, payload);
      return {};
    },
  });
}

/** Creates the worker's child session, named by the run's title (ADR 0037, 2), with its brief as its first message. */
export async function createChild(ctx: Ctx, parent: Stored<SessionDoc>, worker: SubagentWorker, run: { title: string; task: string; brief: RunBrief }, guard: CreationGuard): Promise<string> {
  // A worker that names no model uses the one set for helpers, and the chat's own when none is (ADR 0069, 3).
  const helperModel = settingSchemas.model.parse(await ctx.settings.get('kvcoder.delegate.model'));
  // A worker that names no level uses the one set for helpers, medium by default, so helpers stay quick (ADR 0102, 3).
  const helperThinking = settingSchemas.thinking.parse(await ctx.settings.get('kvcoder.delegate.thinking'));
  // Every helper's level is capped, so no worker runs at the slowest levels (ADR 0108, 3).
  const thinkingLimit = settingSchemas.thinking.parse(await ctx.settings.get('kvcoder.delegate.thinkingLimit'));
  // The helper's level is one its model has (ADR 0087, 11); the levels are looked up before the transaction, for the
  // model the parent has now, and used only when the canonical parent still has it.
  const expected = worker.model ?? helperModel ?? parent.model;
  const levels = (await modelInfo(ctx, expected))?.thinkingLevels;
  const childId = await ctx.store.transaction((tx) => {
    const store = txRecords(tx);
    const canonical = guard(store);
    if (canonical.id !== parent.id) throw invalid('Delegation requires its originating session.');
    const stamp = now();
    const model = worker.model ?? helperModel ?? canonical.model;
    const wanted = cappedLevel(worker.thinking ?? helperThinking, thinkingLimit);
    const child = store.sessions.insert({
      title: shownTitle(run.title),
      autoTitle: false,
      deleting: false,
      status: 'idle',
      parentId: parent.id,
      // A find or review run only reads, whatever its worker (ADR 0108, 2).
      worker: { name: worker.name, instructions: worker.instructions, readOnly: worker.readOnly || run.brief.kind === 'find' || run.brief.kind === 'review' },
      run: run.brief,
      model,
      thinking: levels !== undefined && model === expected ? nearestLevel(levels, wanted) : wanted,
      decides: false,
      clearedThroughSeq: null,
      collapsedThroughSeq: null,
      webHosts: [],
      stepJobId: null,
      stepGeneration: 0,
      stepIntentId: null,
      turnId: null,
      endedTurns: 0,
      nextSeq: 0,
      usage: noUsage(),
    usageBy: { summary: noUsage(), title: noUsage(), helpers: noUsage() },
      durationMs: 0,
      // A helper starts with its parent's check results: it can't delegate, so the program workers' are left out (ADR 0087, 10).
      checks: canonical.checks === null ? null : canonical.checks.filter((check) => !check.name.startsWith(workerCheckName(''))),
      connectors: worker.connectors,
      optedIn: [],
      // A helper keeps its parent's rule files (ADR 0108, 6).
      ...(canonical.rules === undefined ? {} : { rules: canonical.rules }),
      createdAt: stamp,
      updatedAt: stamp,
    });
    appendMessage(store, child, { kind: 'user', content: userContent(run.task), source: { kind: 'subagent', sessionId: parent.id } });
    return child.id;
  });
  await firePoint(ctx, 'kvcoder.session.created', { sessionId: childId, parentId: parent.id });
  return childId;
}

// A child's turn starts on its parent's newest message: its task, or the message of a `continue` (ADR 0085, 4).
function awaitsParent(store: TxRecords, child: Stored<SessionDoc>): boolean {
  const [last] = store.messages.find({ sessionId: child.id }, { limit: 1, order: 'desc' });
  return last?.kind === 'user' && last.source?.kind === 'subagent' && last.source.sessionId === child.parentId;
}

/** Starts the child's turn and tells the parent's stream, so the conversation can stream the child (ADR 0009, 99). */
export async function startChild(ctx: Ctx, childId: string, guard: CreationGuard): Promise<void> {
  const turnId = await ctx.store.transaction((tx) => {
    const store = txRecords(tx);
    const parent = guard(store);
    const child = store.sessions.get(childId);
    if (child !== undefined && child.parentId !== parent.id) throw invalid('The child no longer belongs to its originating session.');
    return child === undefined || child.status !== 'idle' || child.turnId !== null || !awaitsParent(store, child) ? undefined : openTurn(store, child);
  });
  if (turnId === undefined) return;
  const jobId = await beginTurn(ctx, childId, turnId, false);
  if (jobId !== null) ctx.job.progress({ type: 'subagent', sessionId: childId, jobId });
}

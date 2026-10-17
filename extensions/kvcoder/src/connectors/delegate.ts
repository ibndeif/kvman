import { z, type Ctx, type Stored } from '@kvman/sdk';
import { availableWorker, type SubagentWorker, type Worker } from '../delegate/workers.ts';
import { firePoint } from '../registry/session-points.ts';
import { invalid } from '../problems.ts';
import { settingSchemas } from '../register-settings.ts';
import type { CreationGuard } from '../delegate/permission.ts';
import type { SessionDoc } from '../schemas/records.ts';
import { now } from '../sessions/session-lookup.ts';
import { records, txRecords, type TxRecords } from '../store/collections.ts';
import { appendMessage, noUsage, userContent } from '../turns/history.ts';
import { beginTurn, openTurn } from '../turns/start-turn.ts';
import { callInput, type ConnectorCommand } from './connector-command.ts';

// The `delegate` connector (plan 08 §8.5, ADR 0021): a task handed to a worker. A subagent worker runs it in a hidden
// child session that starts from the task alone, with the worker's instructions, connectors, model, and thinking; a
// child never has `delegate` and always has `ask`. A program worker's run is in `src/delegate/`. The check validates the payload and the worker as a kernel job, and the
// step then starts the child (ADR 0011, 9).

/** What the prompt's index says the connector is for; the session's entry adds its workers. */
export const delegateDescription =
  'Hand a self-contained task to a worker: a helper agent that works on it alone and returns its answer. Use it for a specialist view or to do a separate part in parallel, or with background set to true while you go on.';

/** The connector's description with the available workers, as the prompt's index shows it (ADR 0021, 1). */
export function delegateIndexDescription(workers: readonly Worker[]): string {
  return `${delegateDescription} Workers: ${workers.map((worker) => `${worker.name} (${worker.description.replace(/[.\s]+$/, '')})`).join(', ')}.`;
}

const titleShown = 60;

// A helper's name as the person sees it: a title over 60 characters keeps its first 59 and an ellipsis (ADR 0051, 4).
const shownTitle = (title: string): string => (title.length > titleShown ? `${title.slice(0, titleShown - 1)}…` : title);

export const delegateRunSchema = z.strictObject({
  worker: z.string().min(1).describe('The worker to hand the task to, by a name the system prompt lists.'),
  title: z.string().min(1).max(200).describe("The role this run plays, in a few words, such as UI expert or Node.js expert: the person sees it as the helper's name. Keep it under 60 characters; a longer one is shortened."),
  task: z.string().min(1).describe("The worker's whole brief: the goal, the facts it needs, its limits, and what to return."),
  background: z.boolean().describe('true lets you go on at once; the answer arrives later as a message.').exactOptional(),
});

export const delegateContinueSchema = z.strictObject({
  id: z.string().min(1).describe('The helper to continue: the id in the line (helper <id>) under its result.'),
  message: z.string().min(1).describe('What the helper is to do next; it still has its task and everything it did.'),
  background: z.boolean().describe('true lets you go on at once; the answer arrives later as a message.').exactOptional(),
});

export const delegateCommands = {
  run: { registration: 'kvcoder.delegate.check', description: 'Runs a worker on a task; several runs in one reply run in parallel.', payload: delegateRunSchema, asks: false, result: "the worker's final answer, or started <id> with background." },
  continue: { registration: 'kvcoder.delegate.continue.check', description: 'Sends a follow-up to a helper of this chat that has ended, such as one that came back blocked or with questions: it continues with its own history.', payload: delegateContinueSchema, asks: false, result: "the helper's new answer, or started <id> with background." },
} satisfies Record<string, ConnectorCommand>;

export type DelegateContinue = z.output<typeof delegateContinueSchema>;

export type DelegateRun = z.output<typeof delegateRunSchema>;

export function registerDelegateConnector(ctx: Ctx): void {
  ctx.registerCommand('kvcoder.delegate.check', {
    description: delegateCommands.run.description,
    input: callInput(delegateRunSchema),
    output: z.object({}),
    retries: 0,
    handle: async ({ sessionId, payload }) => {
      const session = await records(ctx.store).sessions.get(sessionId);
      await availableWorker(ctx, session?.checks ?? null, payload.worker);
      return {};
    },
  });
}

/** Creates the worker's child session, named by the run's title (ADR 0037, 2), with the task as its first message. */
export async function createChild(ctx: Ctx, parent: Stored<SessionDoc>, worker: SubagentWorker, run: { title: string; task: string }, guard: CreationGuard): Promise<string> {
  // A worker that names no model uses the one set for helpers, and the chat's own when none is (ADR 0069, 3).
  const helperModel = settingSchemas.model.parse(await ctx.settings.get('kvcoder.delegate.model'));
  const childId = await ctx.store.transaction((tx) => {
    const store = txRecords(tx);
    const canonical = guard(store);
    if (canonical.id !== parent.id) throw invalid('Delegation requires its originating session.');
    const stamp = now();
    const child = store.sessions.insert({
      title: shownTitle(run.title),
      autoTitle: false,
      deleting: false,
      status: 'idle',
      parentId: parent.id,
      worker: { name: worker.name, instructions: worker.instructions, readOnly: worker.readOnly },
      model: worker.model ?? helperModel ?? canonical.model,
      thinking: worker.thinking ?? canonical.thinking,
      stepJobId: null,
      stepGeneration: 0,
      stepIntentId: null,
      turnId: null,
      endedTurns: 0,
      nextSeq: 0,
      usage: noUsage(),
    usageBy: { summary: noUsage(), title: noUsage(), helpers: noUsage() },
      durationMs: 0,
      checks: null,
      connectors: worker.connectors,
      optedIn: [],
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

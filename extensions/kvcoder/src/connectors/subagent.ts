import { z, type Ctx, type Stored } from '@kvman/sdk';
import { firePoint } from '../registry/session-points.ts';
import type { SessionDoc } from '../schemas/records.ts';
import { now } from '../sessions/session-lookup.ts';
import { txRecords } from '../store/collections.ts';
import { appendMessage, noUsage, userContent } from '../turns/history.ts';
import { sentHistory } from '../turns/model-context.ts';
import { beginTurn, openTurn } from '../turns/start-turn.ts';
import { callInput, type ConnectorCommand } from './connector-command.ts';

// The `subagent` connector (plan 08 §8.5): a hidden child session with its parent's model and thinking. `fresh`
// starts from the task; `fork` from a copy of the parent's messages so far (and its summary). Its connectors are a
// subset of the parent's, never `subagent`, always `ask`. The check validates the payload as a kernel job, and the step
// then starts the child (ADR 0011, 9).

/** What the prompt's index says the connector is for. */
export const subagentDescription = 'Hand a self-contained task to a helper agent. Use it to research or build a separate part in parallel, or with background set to true while you go on.';

export const subagentRunSchema = z.strictObject({
  task: z.string().min(1).describe("The helper's whole brief: its role, the goal, the facts it needs, its limits, and what to return."),
  mode: z.enum(['fresh', 'fork']).describe('fresh starts from the task alone; fork starts from a copy of this conversation.'),
  connectors: z.array(z.string()).describe('The connectors the helper may use; all of yours when left out. It always has ask and never subagent.').exactOptional(),
  background: z.boolean().describe('true lets you go on at once; the answer arrives later as a message.').exactOptional(),
});

export const subagentCommands = {
  run: { registration: 'kvcoder.subagent.check', description: 'Runs a helper agent on a task; several runs in one reply run in parallel.', payload: subagentRunSchema, asks: false, result: "the helper's final answer, or started <id> with background." },
} satisfies Record<string, ConnectorCommand>;

export type SubagentRun = z.output<typeof subagentRunSchema>;

export function registerSubagentConnector(ctx: Ctx): void {
  ctx.registerCommand('kvcoder.subagent.check', { description: subagentCommands.run.description, input: callInput(subagentRunSchema), output: z.object({}), retries: 0, handle: () => ({}) });
}

/** The first connector of a run that its child can't have, if any. */
export function refusedConnector(run: SubagentRun, allowed: ReadonlySet<string>): string | undefined {
  return (run.connectors ?? []).find((name) => name === 'subagent' || !allowed.has(name));
}

/** Creates the child session, with its starting messages; `beforeSeq` ends a fork's copy before the parent's current answer. */
export async function createChild(ctx: Ctx, parent: Stored<SessionDoc>, run: SubagentRun, beforeSeq: number): Promise<string> {
  const copied = run.mode === 'fork' ? await sentHistory(ctx, parent.id, beforeSeq) : undefined;
  const childId = await ctx.store.transaction((tx) => {
    const store = txRecords(tx);
    const stamp = now();
    const child = store.sessions.insert({
      title: run.task.slice(0, 60),
      autoTitle: false,
      status: 'idle',
      parentId: parent.id,
      model: parent.model,
      thinking: parent.thinking,
      stepJobId: null,
      turnId: null,
      endedTurns: 0,
      nextSeq: 0,
      usage: noUsage(),
      durationMs: 0,
      checks: null,
      connectors: run.connectors ?? null,
      createdAt: stamp,
      updatedAt: stamp,
    });
    const messages = copied === undefined ? [] : [...(copied.summary === undefined ? [] : [copied.summary]), ...copied.messages];
    for (const message of messages) appendMessage(store, child, { kind: message.kind, content: message.kind === 'summary' ? { text: message.content['text'] ?? '', coversThroughSeq: -1 } : message.content, fileIds: message.fileIds, fileNames: message.fileNames });
    appendMessage(store, child, { kind: 'user', content: userContent(run.task), source: { kind: 'subagent', sessionId: parent.id } });
    return child.id;
  });
  await firePoint(ctx, 'kvcoder.session.created', { sessionId: childId, parentId: parent.id });
  return childId;
}

/** Starts the child's turn and tells the parent's stream, so the conversation can stream the child (ADR 0009, 99). */
export async function startChild(ctx: Ctx, childId: string): Promise<void> {
  const turnId = await ctx.store.transaction((tx) => {
    const store = txRecords(tx);
    const child = store.sessions.get(childId);
    return child === undefined || child.status !== 'idle' ? undefined : openTurn(store, child);
  });
  if (turnId === undefined) return;
  const jobId = await beginTurn(ctx, childId, turnId, false);
  ctx.job.progress({ type: 'subagent', sessionId: childId, jobId });
}

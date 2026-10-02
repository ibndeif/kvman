import { z, type Ctx, type Stored } from '@kvman/sdk';
import { builtinHelp, callInput, errorOutput, type CallResult } from '../connector-line.ts';
import { invalidInput } from './invalid-input.ts';
import { firePoint } from '../registry/session-points.ts';
import type { SessionDoc } from '../schemas/records.ts';
import { now } from '../sessions/session-lookup.ts';
import { txRecords } from '../store/collections.ts';
import { appendMessage, noUsage, userContent } from '../turns/history.ts';
import { sentHistory } from '../turns/model-context.ts';
import { beginTurn, openTurn } from '../turns/start-turn.ts';

// The `subagent` connector (plan 08 §8.5): a hidden child session with its parent's model and thinking. `fresh`
// starts from the task; `fork` from a copy of the parent's messages so far (and its summary). Its connectors are a
// subset of the parent's, never `subagent`, always `ask`.

export const runSchema = z.strictObject({ task: z.string().min(1), mode: z.enum(['fresh', 'fork']), connectors: z.array(z.string()).exactOptional(), shell: z.boolean().exactOptional() });

export type SubagentRun = z.output<typeof runSchema>;

/** A `subagent` call's run, or what the call printed instead. */
export function subagentCall(words: readonly string[], stdin: string | null, allowed: ReadonlySet<string>): SubagentRun | CallResult {
  if (words.length === 1 && words[0] === '-h') return { output: builtinHelp.subagent, exitCode: 0 };
  const call = callInput(words, stdin, 'subagent');
  if ('output' in call) return call;
  if (call.command !== 'run') return errorOutput({ code: 'NOT_FOUND', message: `subagent has no command ${call.command}; run \`subagent -h\`.` });
  const parsed = runSchema.safeParse(call.input);
  if (!parsed.success) return invalidInput('subagent', 'run', parsed.error.issues);
  const refused = (parsed.data.connectors ?? []).find((name) => name === 'subagent' || !allowed.has(name));
  if (refused !== undefined) return errorOutput({ code: 'VALIDATION_FAILED', message: `A subagent can't have the connector ${refused}.` });
  return parsed.data;
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
      shell: run.shell ?? true,
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

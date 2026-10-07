import { ProblemError, z, type Ctx, type Stored } from '@kvman/sdk';
import type {} from '@kvman/kvai';
import type { JsonValue } from '../connector-call.ts';
import { runBinaryChecks } from '../calls/binary-checks.ts';
import { workerChecks } from '../delegate/register-worker-run.ts';
import { runTool } from '../calls/run-tool.ts';
import { shellFor } from '../calls/shell-program.ts';
import { sessionTools, type SessionTools } from '../prompt/session-prompt.ts';
import { ownerName } from '../jobs/process-records.ts';
import { activeConnectors } from '../registry/register-connectors.ts';
import { readSettings } from '../register-settings.ts';
import type { SessionDoc, Usage } from '../schemas/records.ts';
import { records, txRecords, type TxRecords } from '../store/collections.ts';
import { compact } from './compaction.ts';
import { endTurn } from './end-turn.ts';
import { addUsage, appendMessage, appendQueued, userContent } from './history.ts';
import { lostHint, lostRetries, lostTokens, repairedCalls } from './lost-reply.ts';
import { modelMessages, sentHistory } from './model-context.ts';
import { completeWithRetries } from './model-retry.ts';
import { evaluateCall, runApproved, type ToolCall } from './run-calls.ts';
import { appendResults, continueTurn, liveTurn, settleCalls } from './settle-calls.ts';
import { currentTurn } from './start-turn.ts';

// A step (plan 08 §8.2): append what the previous step left (approved calls run first), build the prompt, compact if
// needed, call the model, then run all the reply's calls together.

/** The step job's options (plan 08 §8.1, ADR 0008, 67). */
export const stepOptions = { retries: 0, timeoutMs: 1_200_000 };

async function beginStep(ctx: Ctx, sessionId: string, turnId: string, maxSteps: number | null): Promise<Stored<SessionDoc> | undefined> {
  const found = await currentTurn(ctx, sessionId, turnId);
  if (found === undefined || found.session.status !== 'running') return undefined;
  const { turn } = found;
  const held = turn.calls.length === 0 ? [] : await Promise.all(turn.results.map((result) => runApproved(ctx, found.session, result)));
  const steps = await ctx.store.transaction((tx) => {
    const store = txRecords(tx);
    const live = liveTurn(store, sessionId, turnId);
    if (live === undefined) return undefined;
    if (live.turn.calls.length > 0) appendResults(store, live.session, turnId, live.turn.calls, held);
    store.turns.update(turnId, { calls: [], results: [], pending: [] });
    store.sessions.update(sessionId, { stepJobId: ctx.job.id });
    appendQueued(store, live.session, turnId);
    return live.turn.steps;
  });
  if (steps === undefined) return undefined;
  if (maxSteps !== null && steps >= maxSteps) {
    await endTurn(ctx, sessionId, turnId, 'maxSteps', 'step', { code: 'MAX_STEPS', params: { steps: maxSteps } });
    return undefined;
  }
  await records(ctx.store).turns.update(turnId, { steps: steps + 1 });
  return records(ctx.store).sessions.get(sessionId);
}

async function withChecks(ctx: Ctx, session: Stored<SessionDoc>): Promise<Stored<SessionDoc>> {
  if (session.checks !== null) return session;
  const checks = [...(await runBinaryChecks(ctx, await shellFor(ctx), await activeConnectors(ctx))), ...(await workerChecks(ctx))];
  return records(ctx.store).sessions.update(session.id, { checks });
}

// Adds a call's usage to the turn and session, and to the parent of a subagent (plan 08 §8.1).
function addCallUsage(store: TxRecords, session: Stored<SessionDoc>, turnId: string, usage: Usage): void {
  const turn = store.turns.get(turnId);
  if (turn !== undefined) store.turns.update(turnId, { usage: addUsage(turn.usage, usage) });
  store.sessions.update(session.id, { usage: addUsage(store.sessions.get(session.id)?.usage ?? session.usage, usage) });
  const parent = session.parentId === null ? undefined : store.sessions.get(session.parentId);
  if (parent === undefined) return;
  store.sessions.update(parent.id, { usage: addUsage(parent.usage, usage) });
  const parentTurn = parent.turnId === null ? undefined : store.turns.get(parent.turnId);
  if (parentTurn !== undefined) store.turns.update(parentTurn.id, { usage: addUsage(parentTurn.usage, usage) });
}

const toolCallSchema = z.object({ type: z.literal('toolCall'), id: z.string(), name: z.string(), arguments: z.record(z.string(), z.json()) });

async function callModel(ctx: Ctx, session: Stored<SessionDoc>, turnId: string, tools: SessionTools): Promise<{ calls: ToolCall[]; seq: number; lost: number | undefined } | undefined> {
  const messages = await modelMessages(ctx, await sentHistory(ctx, session.id, session.nextSeq));
  const started = Date.now();
  try {
    const answer = await completeWithRetries(ctx, { ...(session.model === null ? {} : { model: session.model }), sessionId: session.id, systemPrompt: tools.built.prompt, messages, tools: [runTool(tools.listed.map((listed) => listed.name))], thinking: session.thinking });
    const durationMs = Date.now() - started;
    const { blocks, broken } = repairedCalls(answer.message.content);
    const message = { ...answer.message, content: blocks };
    const seq = await ctx.store.transaction((tx) => {
      const store = txRecords(tx);
      const live = liveTurn(store, session.id, turnId);
      if (live === undefined) return undefined;
      const stored = appendMessage(store, live.session, { kind: 'assistant', content: message, turnId, model: message.provider + '/' + message.model, usage: answer.usage, durationMs });
      addCallUsage(store, live.session, turnId, answer.usage);
      return stored.seq;
    });
    if (seq === undefined) return undefined;
    const calls = blocks.flatMap((block) => {
      const parsed = toolCallSchema.safeParse(block);
      return parsed.success ? [{ id: parsed.data.id, name: parsed.data.name, arguments: parsed.data.arguments }] : [];
    });
    const lost = calls.length > 0 ? undefined : broken > 0 ? answer.usage.output : lostTokens(blocks, { output: answer.usage.output, reasoning: message.usage.reasoning });
    return { calls, seq, lost };
  } catch (error) {
    if (!(error instanceof ProblemError) || ctx.job.signal.aborted) throw error;
    await endTurn(ctx, session.id, turnId, 'failed', 'step', { code: 'STEP_FAILED', params: { code: error.problem.code, details: failureDetails(error) } });
    return undefined;
  }
}

/** The failed call's Problem params, for the notice's translation (ADR 0009, 133). */
function failureDetails(error: ProblemError): JsonValue {
  const parsed = z.json().safeParse(error.problem.params ?? {});
  return parsed.success ? parsed.data : {};
}

// What follows a reply with no call (plan 08 §8.2): the turn ends, or goes on with the messages that arrived, or, when the
// reply was lost on the way, goes on after a hint to the model, at most `lostRetries` times in a turn (ADR 0009, 188).
async function finishWithoutCalls(ctx: Ctx, sessionId: string, turnId: string, maxSteps: number | null, lost: number | undefined): Promise<void> {
  const after = await ctx.store.transaction((tx) => {
    const store = txRecords(tx);
    const live = liveTurn(store, sessionId, turnId);
    if (live === undefined) return undefined;
    if (lost !== undefined && live.turn.lost >= lostRetries) return { action: 'give-up' as const, tokens: lost };
    if (lost !== undefined) {
      store.turns.update(turnId, { lost: live.turn.lost + 1 });
      appendMessage(store, live.session, { kind: 'user', content: userContent(lostHint(lost)), turnId, source: { kind: 'extension', name: ownerName } });
    }
    const appended = appendQueued(store, live.session, turnId);
    return { action: lost !== undefined || appended > 0 ? ('continue' as const) : ('end' as const), tokens: 0 };
  });
  if (after === undefined) return;
  if (after.action === 'give-up') await endTurn(ctx, sessionId, turnId, 'failed', 'step', { code: 'REPLY_LOST', params: { tokens: after.tokens } });
  else if (after.action === 'continue') await continueTurn(ctx, sessionId, turnId, maxSteps);
  else await endTurn(ctx, sessionId, turnId, 'done', 'step');
}

async function runStep(ctx: Ctx, sessionId: string, turnId: string): Promise<void> {
  const settings = await readSettings(ctx);
  const begun = await beginStep(ctx, sessionId, turnId, settings.maxSteps);
  if (begun === undefined) return;
  const checked = await withChecks(ctx, begun);
  const tools = await sessionTools(ctx, checked);
  await compact(ctx, checked, { force: false, compactAt: settings.compactAt, keep: settings.compactKeep, prompt: tools.built.prompt, turnId });
  const session = (await records(ctx.store).sessions.get(sessionId)) ?? checked;
  const answer = await callModel(ctx, session, turnId, tools);
  if (answer === undefined) return;
  if (answer.calls.length === 0) {
    await finishWithoutCalls(ctx, sessionId, turnId, settings.maxSteps, answer.lost);
    return;
  }
  const env = { ctx, session, tools, approval: settings.approval };
  const outcomes = await Promise.all(answer.calls.map((call) => evaluateCall(env, call)));
  await settleCalls(ctx, sessionId, turnId, answer.calls, outcomes, settings.maxSteps);
}

export function registerStep(ctx: Ctx): void {
  ctx.registerCommand('kvcoder.turn.step', {
    description: "Runs one step of a session's turn.",
    input: z.object({ sessionId: z.string(), turnId: z.string() }),
    output: z.object({}),
    ...stepOptions,
    handle: async ({ sessionId, turnId }) => {
      await runStep(ctx, sessionId, turnId);
      return {};
    },
  });
}

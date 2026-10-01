import { ProblemError, z, type Ctx, type Stored } from '@kvman/sdk';
import type {} from '@kvman/kvai';
import { runBinaryChecks } from '../calls/binary-checks.ts';
import { shellTool } from '../calls/shell-tool.ts';
import { sessionTools, shellFor, type SessionTools } from '../prompt/session-prompt.ts';
import { activeConnectors } from '../registry/register-connectors.ts';
import { readSettings } from '../register-settings.ts';
import type { SessionDoc, Usage } from '../schemas/records.ts';
import { records, txRecords, type TxRecords } from '../store/collections.ts';
import { compact } from './compaction.ts';
import { endTurn } from './end-turn.ts';
import { addUsage, appendMessage, appendQueued } from './history.ts';
import { modelMessages, sentHistory } from './model-context.ts';
import { evaluateCall, runApproved, type ToolCall } from './run-calls.ts';
import { appendResults, continueTurn, liveTurn, settleCalls } from './settle-calls.ts';
import { currentTurn } from './start-turn.ts';

// A step (plan 08 §8.2): append what the previous step left (approved calls run first), build the prompt, compact if
// needed, call the model, then run all the reply's calls together.

/** The step job's options (plan 08 §8.1, ADR 0008, 67). */
export const stepOptions = { retries: 0, timeoutMs: 1_200_000 };

async function beginStep(ctx: Ctx, sessionId: string, turnId: string, maxSteps: number): Promise<Stored<SessionDoc> | undefined> {
  const found = await currentTurn(ctx, sessionId, turnId);
  if (found === undefined || found.session.status !== 'running') return undefined;
  const { turn } = found;
  const held = turn.calls.length === 0 ? [] : await Promise.all(turn.results.map(async (result) => runApproved(ctx, { shell: await shellFor(ctx) }, result)));
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
  if (steps >= maxSteps) {
    await endTurn(ctx, sessionId, turnId, 'maxSteps', 'step', { code: 'MAX_STEPS', params: { steps: maxSteps } });
    return undefined;
  }
  await records(ctx.store).turns.update(turnId, { steps: steps + 1 });
  return records(ctx.store).sessions.get(sessionId);
}

async function withChecks(ctx: Ctx, session: Stored<SessionDoc>): Promise<Stored<SessionDoc>> {
  if (session.checks !== null) return session;
  const checks = await runBinaryChecks(ctx, await shellFor(ctx), await activeConnectors(ctx));
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

async function callModel(ctx: Ctx, session: Stored<SessionDoc>, turnId: string, tools: SessionTools): Promise<{ calls: ToolCall[]; seq: number } | undefined> {
  const messages = await modelMessages(ctx, await sentHistory(ctx, session.id, session.nextSeq));
  const started = Date.now();
  try {
    const answer = await ctx.exec('kvai.complete', { ...(session.model === null ? {} : { model: session.model }), systemPrompt: tools.built.prompt, messages, tools: [shellTool(tools.shell.toolName)], thinking: session.thinking });
    const durationMs = Date.now() - started;
    const seq = await ctx.store.transaction((tx) => {
      const store = txRecords(tx);
      const live = liveTurn(store, session.id, turnId);
      if (live === undefined) return undefined;
      const stored = appendMessage(store, live.session, { kind: 'assistant', content: answer.message, turnId, model: answer.message.provider + '/' + answer.message.model, usage: answer.usage, durationMs });
      addCallUsage(store, live.session, turnId, answer.usage);
      return stored.seq;
    });
    if (seq === undefined) return undefined;
    const calls = answer.message.content.flatMap((block) => {
      const parsed = toolCallSchema.safeParse(block);
      return parsed.success ? [{ id: parsed.data.id, name: parsed.data.name, arguments: parsed.data.arguments }] : [];
    });
    return { calls, seq };
  } catch (error) {
    if (!(error instanceof ProblemError) || ctx.job.signal.aborted) throw error;
    await endTurn(ctx, session.id, turnId, 'failed', 'step', { code: 'STEP_FAILED', params: { code: error.problem.code } });
    return undefined;
  }
}

async function finishWithoutCalls(ctx: Ctx, sessionId: string, turnId: string, maxSteps: number): Promise<void> {
  const appended = await ctx.store.transaction((tx) => {
    const store = txRecords(tx);
    const live = liveTurn(store, sessionId, turnId);
    return live === undefined ? undefined : appendQueued(store, live.session, turnId);
  });
  if (appended === undefined) return;
  if (appended > 0) await continueTurn(ctx, sessionId, turnId, maxSteps);
  else await endTurn(ctx, sessionId, turnId, 'done', 'step');
}

async function runStep(ctx: Ctx, sessionId: string, turnId: string): Promise<void> {
  const settings = await readSettings(ctx);
  const begun = await beginStep(ctx, sessionId, turnId, settings.maxSteps);
  if (begun === undefined) return;
  const checked = await withChecks(ctx, begun);
  const tools = await sessionTools(ctx, checked);
  await compact(ctx, checked, { force: false, compactAt: settings.compactAt, prompt: tools.built.prompt, turnId });
  const session = (await records(ctx.store).sessions.get(sessionId)) ?? checked;
  const answer = await callModel(ctx, session, turnId, tools);
  if (answer === undefined) return;
  if (answer.calls.length === 0) {
    await finishWithoutCalls(ctx, sessionId, turnId, settings.maxSteps);
    return;
  }
  const env = { ctx, session, tools, approval: settings.approval, answerSeq: answer.seq };
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

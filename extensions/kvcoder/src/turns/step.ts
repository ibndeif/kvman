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
import { readSettings, type StepSettings } from '../register-settings.ts';
import type { HeldResult, SessionDoc } from '../schemas/records.ts';
import { txRecords } from '../store/collections.ts';
import { compact, promptBasis } from './compaction.ts';
import { clearOldResults } from './clear-results.ts';
import { endTurn } from './end-turn.ts';
import { endTurnState } from './end-turn-state.ts';
import { appendMessage, appendQueued, userContent } from './history.ts';
import { incompleteHint, incompleteReply, incompleteRetries, lostHint, lostRetries, lostTokens, repairedCalls, type Incomplete } from './lost-reply.ts';
import { modelMessages, sentHistory } from './model-context.ts';
import { completeWithRetries } from './model-retry.ts';
import { evaluateCalls, runApproved, runDeferred, type ToolCall } from './run-calls.ts';
import { cacheRetentionOf } from './cache-retention.ts';
import { appendResults } from './call-results.ts';
import { settleCalls } from './settle-calls.ts';
import { addCallUsage } from './usage.ts';
import { claimStepInput, currentStep, stepInputSchema, type StepLease } from './step-claim.ts';
import { liveStep } from './step-intents.ts';
import { advanceStep, dispatchNext, type StepNext } from './step-next.ts';

/** The step job's existing retry/timeout policy (ADR0008). */
export const stepOptions = { retries: 0, timeoutMs: 1_200_000 };

async function beginStep(ctx: Ctx, lease: StepLease, maxSteps: number | null): Promise<Stored<SessionDoc> | undefined> {
  const found = await currentStep(ctx, lease);
  if (found === undefined) return undefined;
  // The approved and the held-back calls run one after another in the model's order, whatever order they were answered in (ADR 0046).
  const held: HeldResult[] = [];
  for (const call of found.turn.calls) {
    const result = found.turn.results.find(saved => saved.toolCallId === call.toolCallId);
    const deferred = found.turn.deferredCalls.find(saved => saved.toolCallId === call.toolCallId);
    if (result === undefined && deferred === undefined) continue;
    const done = result !== undefined ? await runApproved(ctx, found.session, result, lease) : deferred !== undefined ? await runDeferred(ctx, found.session, deferred, lease) : undefined;
    if (done === undefined) return undefined;
    held.push(done);
  }
  const begun = await ctx.store.transaction(tx => {
    ctx.job.signal.throwIfAborted();
    const store = txRecords(tx);
    const live = liveStep(store, lease, lease.jobId);
    if (live === undefined) return undefined;
    if (live.turn.calls.length > 0) appendResults(store, live.session, lease.turnId, live.turn.calls, held);
    store.turns.update(lease.turnId, { calls: [], results: [], pending: [], deferredCalls: [] });
    appendQueued(store, live.session, lease.turnId);
    if (maxSteps !== null && live.turn.steps >= maxSteps) {
      const ended = endTurnState(store, lease.sessionId, lease.turnId, 'maxSteps', 'step', { code: 'MAX_STEPS', params: { steps: maxSteps } }, lease);
      return { next: ended === undefined ? undefined : { kind: 'end' as const, ended } };
    }
    store.turns.update(lease.turnId, { steps: live.turn.steps + 1 });
    return { session: store.sessions.get(lease.sessionId) };
  });
  if (begun === undefined) return undefined;
  if ('next' in begun) { await dispatchNext(ctx, begun.next); return undefined; }
  return begun.session;
}

async function withChecks(ctx: Ctx, session: Stored<SessionDoc>, lease: StepLease): Promise<Stored<SessionDoc> | undefined> {
  if (session.checks !== null) return session;
  // A helper never delegates, so it never checks a program worker (ADR 0087, 10).
  const checks = [...(await runBinaryChecks(ctx, await shellFor(ctx), await activeConnectors(ctx))), ...(session.parentId === null ? await workerChecks(ctx) : [])];
  return ctx.store.transaction(tx => {
    ctx.job.signal.throwIfAborted();
    const store = txRecords(tx);
    return liveStep(store, lease, lease.jobId) === undefined ? undefined : store.sessions.update(session.id, { checks });
  });
}

const toolCallSchema = z.object({ type: z.literal('toolCall'), id: z.string(), name: z.string(), arguments: z.record(z.string(), z.json()) });

type Answer = { calls: ToolCall[]; seq: number; lost: number | undefined; incomplete: Incomplete | undefined };

// `overflow` says what a `kvai/CONTEXT_TOO_LONG` does: hand the failure back for a summary, or end the turn (ADR 0087, 2).
async function callModel(ctx: Ctx, session: Stored<SessionDoc>, lease: StepLease, tools: SessionTools, overflow: 'summarize' | 'end'): Promise<Answer | { tooLong: ProblemError } | undefined> {
  const messages = await modelMessages(ctx, await sentHistory(ctx, session.id, session.nextSeq));
  if (await currentStep(ctx, lease) === undefined) return undefined;
  const started = Date.now();
  try {
    const answer = await completeWithRetries(ctx, { ...(session.model === null ? {} : { model: session.model }), sessionId: session.id, ...cacheRetentionOf(session), systemPrompt: tools.built.prompt, messages, tools: [runTool(tools.listed.map(listed => listed.name))], thinking: session.thinking }, lease);
    const durationMs = Date.now() - started;
    const { blocks, broken } = repairedCalls(answer.message.content);
    const message = { ...answer.message, content: blocks };
    const seq = await ctx.store.transaction(tx => {
      ctx.job.signal.throwIfAborted();
      const store = txRecords(tx);
      const live = liveStep(store, lease, lease.jobId);
      if (live === undefined) return undefined;
      const stored = appendMessage(store, live.session, { kind: 'assistant', content: message, turnId: lease.turnId, model: message.provider + '/' + message.model, usage: answer.usage, basis: promptBasis(tools.built.prompt, tools.listed.map(listed => listed.name)), durationMs });
      addCallUsage(store, live.session, lease.turnId, answer.usage);
      return stored.seq;
    });
    if (seq === undefined) return undefined;
    const calls = blocks.flatMap(block => {
      const parsed = toolCallSchema.safeParse(block);
      return parsed.success ? [{ id: parsed.data.id, name: parsed.data.name, arguments: parsed.data.arguments }] : [];
    });
    const lost = calls.length > 0 ? undefined : broken > 0 ? answer.usage.output : lostTokens(blocks, { output: answer.usage.output, reasoning: message.usage.reasoning });
    return { calls, seq, lost, incomplete: calls.length > 0 || lost !== undefined ? undefined : incompleteReply(blocks, answer.stopReason) };
  } catch (error) {
    if (!(error instanceof ProblemError) || ctx.job.signal.aborted) throw error;
    if (overflow === 'summarize' && error.problem.code === 'kvai/CONTEXT_TOO_LONG') return { tooLong: error };
    await stepFailed(ctx, session, lease, error);
    return undefined;
  }
}

async function stepFailed(ctx: Ctx, session: Stored<SessionDoc>, lease: StepLease, error: ProblemError): Promise<void> {
  await endTurn(ctx, session.id, lease.turnId, 'failed', 'step', { code: 'STEP_FAILED', params: { code: error.problem.code, details: failureDetails(error) } }, lease);
}

// A conversation too long for the model is summarized by force and sent once more; with no summary the turn ends.
async function afterOverflow(ctx: Ctx, session: Stored<SessionDoc>, lease: StepLease, tools: SessionTools, settings: Pick<StepSettings, 'compactAt' | 'compactKeep'>, tooLong: ProblemError): Promise<Answer | undefined> {
  const summarized = await compact(ctx, session, { force: true, compactAt: settings.compactAt, keep: settings.compactKeep, prompt: tools.built.prompt, tools: tools.listed.map(listed => listed.name), turnId: lease.turnId, lease });
  const current = await currentStep(ctx, lease);
  if (current === undefined) return undefined;
  if (!summarized) {
    await stepFailed(ctx, current.session, lease, tooLong);
    return undefined;
  }
  const answer = await callModel(ctx, current.session, lease, tools, 'end');
  return answer === undefined || 'tooLong' in answer ? undefined : answer;
}

function failureDetails(error: ProblemError): JsonValue {
  const parsed = z.json().safeParse(error.problem.params ?? {});
  return parsed.success ? parsed.data : {};
}

// Inbox/lost-reply decision and settlement/end/successor now share one canonical transaction.
async function finishWithoutCalls(ctx: Ctx, lease: StepLease, maxSteps: number | null, lost: number | undefined, incomplete: Incomplete | undefined): Promise<void> {
  const next = await ctx.store.transaction((tx): StepNext => {
    ctx.job.signal.throwIfAborted();
    const store = txRecords(tx);
    const live = liveStep(store, lease, lease.jobId);
    if (live === undefined) return undefined;
    if (lost !== undefined && live.turn.lost >= lostRetries) {
      const ended = endTurnState(store, lease.sessionId, lease.turnId, 'failed', 'step', { code: 'REPLY_LOST', params: { tokens: lost } }, lease);
      return ended === undefined ? undefined : { kind: 'end', ended };
    }
    if (lost !== undefined) {
      store.turns.update(lease.turnId, { lost: live.turn.lost + 1 });
      appendMessage(store, live.session, { kind: 'user', content: userContent(lostHint(lost)), turnId: lease.turnId, source: { kind: 'extension', name: ownerName } });
    }
    // An empty or cut reply gets one hint and another step; the second ends the turn (ADR 0054, 1).
    if (incomplete !== undefined && live.turn.incomplete >= incompleteRetries) {
      const ended = endTurnState(store, lease.sessionId, lease.turnId, 'failed', 'step', { code: 'REPLY_INCOMPLETE', params: { reason: incomplete } }, lease);
      return ended === undefined ? undefined : { kind: 'end', ended };
    }
    if (incomplete !== undefined) {
      store.turns.update(lease.turnId, { incomplete: live.turn.incomplete + 1 });
      appendMessage(store, live.session, { kind: 'user', content: userContent(incompleteHint(incomplete)), turnId: lease.turnId, source: { kind: 'extension', name: ownerName } });
    }
    const appended = appendQueued(store, live.session, lease.turnId);
    if (lost !== undefined || incomplete !== undefined || appended > 0) return advanceStep(store, lease, maxSteps);
    const ended = endTurnState(store, lease.sessionId, lease.turnId, 'done', 'step', undefined, lease);
    return ended === undefined ? undefined : { kind: 'end', ended };
  });
  await dispatchNext(ctx, next);
}

async function runStep(ctx: Ctx, lease: StepLease): Promise<void> {
  const settings = await readSettings(ctx);
  const begun = await beginStep(ctx, lease, settings.maxSteps);
  if (begun === undefined) return;
  const checked = await withChecks(ctx, begun, lease);
  if (checked === undefined) return;
  const tools = await sessionTools(ctx, checked);
  const started = await currentStep(ctx, lease);
  if (started === undefined) return;
  const names = tools.listed.map(listed => listed.name);
  // A step that cleared old results doesn't summarize: the next call reports the prompt's real size (ADR 0094, 1).
  const cleared = await clearOldResults(ctx, checked, lease, started.turn.steps === 1, { prompt: tools.built.prompt, model: checked.model, basis: promptBasis(tools.built.prompt, names) });
  if (!cleared) await compact(ctx, checked, { force: false, compactAt: settings.compactAt, keep: settings.compactKeep, prompt: tools.built.prompt, tools: tools.listed.map(listed => listed.name), turnId: lease.turnId, lease });
  const current = await currentStep(ctx, lease);
  if (current === undefined) return;
  const first = await callModel(ctx, current.session, lease, tools, 'summarize');
  const answer = first !== undefined && 'tooLong' in first ? await afterOverflow(ctx, current.session, lease, tools, settings, first.tooLong) : first;
  if (answer === undefined) return;
  if (answer.calls.length === 0) { await finishWithoutCalls(ctx, lease, settings.maxSteps, answer.lost, answer.incomplete); return; }
  const env = { ctx, session: current.session, tools, approval: settings.approval, allowed: settings.allowed, lease };
  const outcomes = await evaluateCalls(env, answer.calls);
  await settleCalls(ctx, lease, answer.calls, outcomes, settings.maxSteps);
}

export function registerStep(ctx: Ctx): void {
  ctx.registerCommand('kvcoder.turn.step', {
    description: "Runs one step of a session's turn.", input: stepInputSchema, output: z.object({}), ...stepOptions,
    handle: async input => {
      const lease = await claimStepInput(ctx, input);
      if (lease !== undefined) await runStep(ctx, lease);
      return {};
    },
  });
}

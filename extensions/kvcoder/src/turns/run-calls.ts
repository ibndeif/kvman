import { ProblemError, type Ctx, type Stored } from '@kvman/sdk';
import { isAskKind, type QuestionKind } from '../connectors/ask.ts';
import { payloadJsonSchema } from '../connectors/connector-command.ts';
import { parseRunArgs, type RunCall } from '../calls/run-tool.ts';
import { createChild, delegateContinueSchema, delegateRunSchema, startChild } from '../connectors/delegate.ts';
import { continuableHelper, messageHelper } from '../delegate/continue-helper.ts';
import { createRun } from '../delegate/runs.ts';
import { startBackgroundRun } from '../delegate/start-background.ts';
import { availableWorker, isProgram } from '../delegate/workers.ts';
import { creationGuard } from '../delegate/permission.ts';
import { recordFileView } from '../files/file-change.ts';
import { lastChange, mapReminder } from '../maps/map-reminder.ts';
import { invalid } from '../problems.ts';
import { errorOutput, invalidPayloadOutput, type JsonValue } from '../connector-call.ts';
import type { SessionTools } from '../prompt/session-prompt.ts';
import type { HeldResult, SessionDoc } from '../schemas/records.ts';
import { now } from '../sessions/session-lookup.ts';
import { txRecords } from '../store/collections.ts';
import { currentStep, type StepLease } from './step-claim.ts';
import { liveStep } from './step-intents.ts';
import { failedCall, orderedCall, runHelp, runTarget, targetOf, textResult, type CallDone, type CommandTarget } from './run-command.ts';
import { callPermission, dispatchGuard } from './call-permission.ts';
import { helperAllows, helperRefusal } from './helper-calls.ts';
import { readOnlyAllows, readOnlyRefusal } from './read-only.ts';
import type { ApprovalRule } from '../schemas/approval-rule.ts';
import { ruleCovers } from './approval-rules.ts';

// How one call of a reply runs (plan 08 §8.3): the `run` tool names a connector's command, which runs as a kernel job.
// `shell exec`, a binary's `exec`, `fs write`, and `fs edit` ask the person first when `kvcoder.approval` is
// `ask`, or unless the payload says `risky: false` (ADR 0009, 161; ADR 0011, 7), and none that the person's approval
// rules cover (ADR 0091, 2). A registered command with `asks`
// asks too (ADR 0022, 5), and so does a program worker set to ask (ADR 0021, 12). With `never` no call asks (ADR 0077).
// A call either returns its result now, or waits on the person or on a worker's subagent.

export type ToolCall = { id: string; name: string; arguments: Record<string, JsonValue> };

export type CallOutcome =
  | { kind: 'result'; held: HeldResult }
  | { kind: 'question'; questionKind: QuestionKind; question: Record<string, JsonValue> }
  | { kind: 'subagent'; childSessionId: string }
  | { kind: 'worker'; runId: string }
  /** An effect held back behind an earlier call's pending approval, to run in the model's order (ADR 0046). */
  | { kind: 'deferred'; call: RunCall };

export type CallEnv = { ctx: Ctx; session: Stored<SessionDoc>; tools: SessionTools; approval: 'ask' | 'auto' | 'never'; allowed: readonly ApprovalRule[]; lease: StepLease };

const result = (toolCallId: string, done: CallDone): CallOutcome => ({ kind: 'result', held: { toolCallId, ...done, run: null } });

// A call whose arguments never made a connector command: there is nothing for a card to show.
const refused = (toolCallId: string, message: string): CallOutcome => result(toolCallId, { text: errorOutput({ code: 'VALIDATION_FAILED', message }).output, details: null, isError: true });

// The payload of a call that asks, checked before the person is asked about it.
function invalidPayload(call: RunCall, target: CommandTarget): string | undefined {
  if (target.builtin === undefined) return undefined;
  const parsed = target.builtin.payload.safeParse(call.payload);
  if (parsed.success) return undefined;
  const issues = parsed.error.issues.map((issue) => ({ path: issue.path.map(String).join('.'), message: issue.message }));
  return invalidPayloadOutput(call, issues, payloadJsonSchema(target.builtin.payload)).output;
}

// A checked `delegate run` (ADR 0021): a subagent worker's child session, or a program worker's run, either of which
// the turn waits on or which runs in the background. A program worker may ask the person first (ADR 0021, 12).
async function delegateOutcome(env: CallEnv, toolCallId: string, call: RunCall, held: boolean): Promise<CallOutcome> {
  const { ctx, session } = env;
  const run = delegateRunSchema.parse(call.payload);
  const worker = await availableWorker(ctx, session.checks, run.worker);
  const guard = await creationGuard(ctx, env.lease, worker);
  if (isProgram(worker)) {
    if (worker.approval === 'ask' && env.approval !== 'never') {
      await ctx.store.transaction(tx => { guard(txRecords(tx)); });
      return { kind: 'question', questionKind: 'approval', question: call };
    }
    if (held) return heldBackRun(toolCallId, call);
    const started = await createRun(ctx, session.id, worker, run, run.background === true ? null : toolCallId, guard);
    if (run.background !== true) return { kind: 'worker', runId: started.id };
    if (await currentStep(ctx, env.lease) === undefined) return refused(toolCallId, 'The originating step is no longer current.');
    await startBackgroundRun(ctx, started, () => creationGuard(ctx, env.lease, worker), store => liveStep(store, env.lease, env.lease.jobId) !== undefined);
    return result(toolCallId, textResult(call, `started ${started.id}`));
  }
  if (held) return heldBackRun(toolCallId, call);
  const childId = await createChild(ctx, session, worker, run, guard);
  if (run.background !== true) return { kind: 'subagent', childSessionId: childId };
  const current = await ctx.store.transaction(tx => {
    const store = txRecords(tx);
    if (liveStep(store, env.lease, env.lease.jobId) === undefined) return false;
    store.background.insert({ sessionId: session.id, ref: childId, kind: 'subagent', call: run.title, startedAt: now() });
    return true;
  });
  if (!current || await currentStep(ctx, env.lease) === undefined) return refused(toolCallId, 'The originating step is no longer current.');
  await startChild(ctx, childId, await creationGuard(ctx, env.lease, worker));
  return result(toolCallId, textResult(call, `started ${childId}`));
}

// A checked `delegate continue` (ADR 0085, 4): the helper gets its message and goes on, waited for or in the background.
async function continueOutcome(env: CallEnv, toolCallId: string, call: RunCall, held: boolean): Promise<CallOutcome> {
  const { ctx, session } = env;
  const request = delegateContinueSchema.parse(call.payload);
  const { worker } = await continuableHelper(ctx, session.id, request.id);
  const guard = await creationGuard(ctx, env.lease, worker);
  if (held) return heldBackRun(toolCallId, call);
  if (!(await messageHelper(ctx, env.lease, request, guard))) return refused(toolCallId, 'The originating step is no longer current.');
  if (request.background !== true) return { kind: 'subagent', childSessionId: request.id };
  await startChild(ctx, request.id, await creationGuard(ctx, env.lease, worker));
  return result(toolCallId, textResult(call, `started ${request.id}`));
}

function evaluateCall(env: CallEnv, toolCall: ToolCall, held: boolean): Promise<CallOutcome> {
  if (toolCall.name !== 'run') return Promise.resolve(refused(toolCall.id, `The call's arguments are invalid: the tool is run, not ${toolCall.name}.`));
  const args = parseRunArgs(toolCall.arguments);
  if (!args.success) return Promise.resolve(refused(toolCall.id, `The call's arguments are invalid: ${args.problems}. Call run again with the arguments fixed.`));
  return orderedCall(env.ctx, env.session, args.data, () => evaluateCurrentCall(env, toolCall, args.data, held));
}

// A call that could change something (ADR 0046, amendment 2): a built-in command that can ask for approval, a helper
// run, or anything that isn't a known built-in command. Help, reads, and `ask` are not.
function changesThings(toolCall: ToolCall): boolean {
  const args = toolCall.name === 'run' ? parseRunArgs(toolCall.arguments) : undefined;
  if (args?.success !== true || args.data.command === 'help') return false;
  const builtin = targetOf([], args.data)?.builtin;
  return builtin === undefined || builtin.asks === true || isHelperRun(args.data);
}

const fileRead = 'kvcoder.fs.file.get';
const isHelperRun = (call: RunCall): boolean => call.connector === 'delegate' && (call.command === 'run' || call.command === 'continue');
const waitsForDecision = (outcome: CallOutcome): boolean => outcome.kind === 'deferred' || (outcome.kind === 'question' && outcome.questionKind === 'approval');
// A helper run that would start behind a pending approval isn't started (ADR 0046, amendment 4); one that asks first is still asked.
const heldBackRun = (toolCallId: string, call: RunCall): CallOutcome => result(toolCallId, failedCall(call, errorOutput({ code: 'VALIDATION_FAILED', message: 'Not started: an earlier call in this reply waits for a decision. Make this call again after it is decided.' }).output));

/**
 * Evaluates a reply's calls (ADR 0046): those that could change something one after another in the model's order,
 * each told whether an earlier one still waits for the person's decision; the others at once, in parallel.
 */
export async function evaluateCalls(env: CallEnv, calls: readonly ToolCall[]): Promise<CallOutcome[]> {
  const free = calls.map((toolCall) => (changesThings(toolCall) ? undefined : evaluateCall(env, toolCall, false)));
  const ordered = (async () => {
    const done = new Map<ToolCall, CallOutcome>();
    let held = false;
    for (const toolCall of calls.filter(changesThings)) {
      const outcome = await evaluateCall(env, toolCall, held);
      held ||= waitsForDecision(outcome);
      done.set(toolCall, outcome);
    }
    return done;
  })();
  const [inOrder, atOnce] = await Promise.all([ordered, Promise.all(free)]);
  const outcomes = calls.map((toolCall, index) => {
    const outcome = atOnce[index] ?? inOrder.get(toolCall);
    if (outcome === undefined) throw invalid('A call of the reply was not evaluated.');
    return outcome;
  });
  return reminded(env, calls, outcomes);
}

// The lead's reply that changed something while its map says no task is being done is told so once (ADR 0074, 6).
async function reminded(env: CallEnv, calls: readonly ToolCall[], outcomes: CallOutcome[]): Promise<CallOutcome[]> {
  if (env.session.parentId !== null) return outcomes;
  const parsed = calls.map((toolCall) => {
    const args = toolCall.name === 'run' ? parseRunArgs(toolCall.arguments) : undefined;
    return args?.success === true ? args.data : undefined;
  });
  const index = lastChange(parsed, outcomes.map((outcome) => outcome.kind === 'result' && !outcome.held.isError));
  const outcome = index === undefined ? undefined : outcomes[index];
  if (index === undefined || outcome?.kind !== 'result') return outcomes;
  const line = await mapReminder(env.ctx, env.session.id);
  return line === undefined ? outcomes : outcomes.with(index, { kind: 'result', held: { ...outcome.held, text: `${outcome.held.text}${line}` } });
}

async function evaluateCurrentCall(env: CallEnv, toolCall: ToolCall, call: RunCall, held: boolean): Promise<CallOutcome> {
  const { ctx } = env;
  if (await currentStep(ctx, env.lease) === undefined) return refused(toolCall.id, 'The originating step is no longer current.');
  const permitted = await callPermission(ctx, env.lease, call);
  if ('error' in permitted) return result(toolCall.id, failedCall(call, errorOutput(permitted.error).output));
  const session = permitted.grants.session, target = permitted.target;
  if (call.command === 'help') return result(toolCall.id, await runHelp(ctx, call, dispatchGuard(ctx, env.lease, call)));
  if (target === undefined) return refused(toolCall.id, 'The connector command is no longer available.');
  if (session.parentId !== null && !helperAllows(target.builtin)) return result(toolCall.id, failedCall(call, errorOutput({ code: 'VALIDATION_FAILED', message: helperRefusal }).output));
  // A read-only worker's helper is refused before anyone is asked (ADR 0056, 3).
  if (session.worker?.readOnly === true && !readOnlyAllows(call.command, target.builtin, target)) return result(toolCall.id, failedCall(call, errorOutput({ code: 'VALIDATION_FAILED', message: readOnlyRefusal(call.connector, call.command) }).output));
  if (target.builtin?.asks === true) {
    const invalid = invalidPayload(call, target);
    if (invalid !== undefined) return result(toolCall.id, failedCall(call, invalid));
    const asks = env.approval === 'ask' || (env.approval === 'auto' && call.payload['risky'] !== false);
    // A call the person's rules cover runs without asking, with `ask` too (ADR 0091, 2).
    if (asks && !ruleCovers(env.allowed, call, target.registration)) return { kind: 'question', questionKind: 'approval', question: call };
  }
  if (target.asks === true && env.approval !== 'never') return { kind: 'question', questionKind: 'approval', question: call };
  if (held && !isHelperRun(call) && (target.builtin === undefined || target.builtin.asks === true)) return { kind: 'deferred', call };
  if (await currentStep(ctx, env.lease) === undefined) return refused(toolCall.id, 'The originating step is no longer current.');
  const done = await runTarget(ctx, session, call, target, dispatchGuard(ctx, env.lease, call, target));
  // What the chat has now read is what it may change (ADR 0053, 2).
  if (!done.isError && target.registration === fileRead && typeof call.payload['path'] === 'string') await recordFileView(ctx, session.id, call.payload['path']);
  if (done.isError || (call.connector !== 'ask' && call.connector !== 'delegate')) return result(toolCall.id, done);
  if (call.connector === 'delegate') {
    try { return await (call.command === 'continue' ? continueOutcome(env, toolCall.id, call, held) : delegateOutcome(env, toolCall.id, call, held)); }
    catch (error) {
      if (!(error instanceof ProblemError) || ctx.job.signal.aborted) throw error;
      return result(toolCall.id, failedCall(call, errorOutput(error.problem).output));
    }
  }
  return isAskKind(call.command) ? { kind: 'question', questionKind: call.command, question: call.payload } : result(toolCall.id, done);
}

/** What an approved call of the old shell tool returns: it is never run (ADR 0011, 12). */
const oldCallText = 'denied by the user\nMake this call again with the run tool.';

/** Runs an approved call held in the turn. */
export function runApproved(ctx: Ctx, session: Stored<SessionDoc>, held: HeldResult, lease?: StepLease): Promise<HeldResult | undefined> {
  if (held.run === null) return Promise.resolve(held);
  if (!('connector' in held.run)) return Promise.resolve({ toolCallId: held.toolCallId, text: oldCallText, details: null, isError: true, run: null });
  const call = held.run;
  return orderedCall(ctx, session, call, () => runCurrentApproval(ctx, session, held, call, lease));
}

async function runCurrentApproval(ctx: Ctx, session: Stored<SessionDoc>, held: HeldResult, call: RunCall, lease?: StepLease): Promise<HeldResult | undefined> {
  if (lease === undefined) throw invalid('Current step authority is required for approved execution.');
  if (await currentStep(ctx, lease) === undefined) return undefined;
  if (session.id !== lease.sessionId) throw invalid('Approved execution requires its originating session.');
  const permitted = await callPermission(ctx, lease, call, held);
  const done = 'error' in permitted ? failedCall(call, errorOutput(permitted.error).output) : permitted.target === undefined ? failedCall(call, errorOutput({ code: 'VALIDATION_FAILED', message: 'The connector command is no longer available.' }).output) : await runTarget(ctx, permitted.grants.session, call, permitted.target, dispatchGuard(ctx, lease, call, permitted.target, held));
  return { toolCallId: held.toolCallId, ...done, run: null };
}

/** Runs a call that was held back behind an approval: it was permitted to run by itself, and is checked again now. */
export async function runDeferred(ctx: Ctx, session: Stored<SessionDoc>, deferred: { toolCallId: string; call: RunCall }, lease: StepLease): Promise<HeldResult | undefined> {
  if (await currentStep(ctx, lease) === undefined) return undefined;
  const { call } = deferred;
  const permitted = await callPermission(ctx, lease, call);
  const done = 'error' in permitted ? failedCall(call, errorOutput(permitted.error).output) : permitted.target === undefined ? failedCall(call, errorOutput({ code: 'VALIDATION_FAILED', message: 'The connector command is no longer available.' }).output) : await runTarget(ctx, session, call, permitted.target, dispatchGuard(ctx, lease, call, permitted.target));
  return { toolCallId: deferred.toolCallId, ...done, run: null };
}

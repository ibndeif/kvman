import type { Ctx, Stored } from '@kvman/sdk';
import { isAskKind, type QuestionKind } from '../connectors/ask.ts';
import { payloadJsonSchema } from '../connectors/connector-command.ts';
import { parseRunArgs, type RunCall } from '../calls/run-tool.ts';
import { createChild, delegateRunSchema, startChild } from '../connectors/delegate.ts';
import { createRun, launchRun } from '../delegate/runs.ts';
import { availableWorker, isProgram } from '../delegate/workers.ts';
import { builtinConnectors, errorOutput, invalidPayloadOutput, noCommandMessage, noConnectorMessage, type JsonValue } from '../connector-call.ts';
import type { SessionTools } from '../prompt/session-prompt.ts';
import { activeConnectors } from '../registry/register-connectors.ts';
import type { HeldResult, SessionDoc } from '../schemas/records.ts';
import { now } from '../sessions/session-lookup.ts';
import { records } from '../store/collections.ts';
import { commandNamesOf, failedCall, runHelp, runTarget, targetOf, textResult, type CallDone, type CommandTarget } from './run-command.ts';

// How one call of a reply runs (plan 08 §8.3): the `run` tool names a connector's command, which runs as a kernel job.
// `shell exec`, a binary's `exec`, `fs write`, and `fs edit` ask the person first when `kvcoder.shell.approval` is
// `ask`, or unless the payload says `risky: false` (ADR 0009, 161; ADR 0011, 7). A registered command with `asks`
// always asks (ADR 0022, 5). A call either returns its result now, or waits on the person or on a worker's subagent.

export type ToolCall = { id: string; name: string; arguments: Record<string, JsonValue> };

export type CallOutcome =
  | { kind: 'result'; held: HeldResult }
  | { kind: 'question'; questionKind: QuestionKind; question: Record<string, JsonValue> }
  | { kind: 'subagent'; childSessionId: string }
  | { kind: 'worker'; runId: string };

export type CallEnv = { ctx: Ctx; session: Stored<SessionDoc>; tools: SessionTools; approval: 'ask' | 'auto' };

const result = (toolCallId: string, done: CallDone): CallOutcome => ({ kind: 'result', held: { toolCallId, ...done, run: null } });

// A call whose arguments never made a connector command: there is nothing for a card to show.
const refused = (toolCallId: string, message: string): CallOutcome => result(toolCallId, { text: errorOutput({ code: 'VALIDATION_FAILED', message }).output, details: null, isError: true });

// Why a session can't call a connector: a subagent wasn't given it, or there is none by that name; one that is turned
// off counts as none (ADR 0014, 7).
function unavailable(env: CallEnv, connector: string): string {
  const known = builtinConnectors.some((name) => name === connector) || env.tools.connectors.some((candidate) => candidate.name === connector);
  if (known && !env.tools.disabled.has(connector) && env.session.parentId !== null) return `${connector} isn't available in this subagent.`;
  return noConnectorMessage(connector, env.tools.listed.map((listed) => listed.name));
}

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
async function delegateOutcome(env: CallEnv, toolCallId: string, call: RunCall): Promise<CallOutcome> {
  const { ctx, session } = env;
  const run = delegateRunSchema.parse(call.payload);
  const worker = await availableWorker(ctx, session.checks, run.worker);
  if (isProgram(worker)) {
    if (worker.approval === 'ask') return { kind: 'question', questionKind: 'approval', question: call };
    const started = await createRun(ctx, session.id, worker, { description: call.description, task: run.task }, run.background === true ? null : toolCallId);
    if (run.background !== true) return { kind: 'worker', runId: started.id };
    await launchRun(ctx, started.id);
    return result(toolCallId, textResult(call, `started ${started.id}`));
  }
  const childId = await createChild(ctx, session, worker, run);
  if (run.background !== true) return { kind: 'subagent', childSessionId: childId };
  await records(ctx.store).background.insert({ sessionId: session.id, ref: childId, kind: 'subagent', call: call.description, startedAt: now() });
  await startChild(ctx, childId);
  return result(toolCallId, textResult(call, `started ${childId}`));
}

export async function evaluateCall(env: CallEnv, toolCall: ToolCall): Promise<CallOutcome> {
  const { ctx, session, tools } = env;
  if (toolCall.name !== 'run') return refused(toolCall.id, `The call's arguments are invalid: the tool is run, not ${toolCall.name}.`);
  const args = parseRunArgs(toolCall.arguments);
  if (!args.success) return refused(toolCall.id, `The call's arguments are invalid: ${args.problems}. Call run again with the arguments fixed.`);
  const call = args.data;
  if (!tools.listed.some((listed) => listed.name === call.connector)) return refused(toolCall.id, unavailable(env, call.connector));
  if (call.command === 'help') return result(toolCall.id, await runHelp(ctx, call));
  const target = targetOf(tools.connectors, call);
  if (target === undefined) return result(toolCall.id, failedCall(call, errorOutput({ code: 'NOT_FOUND', message: noCommandMessage(call.connector, call.command, commandNamesOf(tools.connectors, call.connector)) }).output));
  if (target.builtin?.asks === true) {
    const invalid = invalidPayload(call, target);
    if (invalid !== undefined) return result(toolCall.id, failedCall(call, invalid));
    if (env.approval === 'ask' || call.payload['risky'] !== false) return { kind: 'question', questionKind: 'approval', question: call };
  }
  if (target.asks === true) return { kind: 'question', questionKind: 'approval', question: call };
  const done = await runTarget(ctx, session, call, target);
  if (done.isError || (call.connector !== 'ask' && call.connector !== 'delegate')) return result(toolCall.id, done);
  if (call.connector === 'delegate') return delegateOutcome(env, toolCall.id, call);
  return isAskKind(call.command) ? { kind: 'question', questionKind: call.command, question: call.payload } : result(toolCall.id, done);
}

/** What an approved call of the old shell tool returns: it is never run (ADR 0011, 12). */
const oldCallText = 'denied by the user\nMake this call again with the run tool.';

/** Runs an approved call held in the turn. */
export async function runApproved(ctx: Ctx, session: Stored<SessionDoc>, held: HeldResult): Promise<HeldResult> {
  if (held.run === null) return held;
  if (!('connector' in held.run)) return { toolCallId: held.toolCallId, text: oldCallText, details: null, isError: true, run: null };
  const connectors = await activeConnectors(ctx);
  const target = targetOf(connectors, held.run);
  const done = target === undefined ? failedCall(held.run, errorOutput({ code: 'NOT_FOUND', message: noCommandMessage(held.run.connector, held.run.command, commandNamesOf(connectors, held.run.connector)) }).output) : await runTarget(ctx, session, held.run, target);
  return { toolCallId: held.toolCallId, ...done, run: null };
}

import type { Ctx, Stored } from '@kvman/sdk';
import { builtinConnectors, callInput, errorOutput, parseLine, refusedText, resultText, runCommandsCall, type CallResult } from '../connector-line.ts';
import { askCall, type QuestionKind } from '../calls/ask.ts';
import { jobsCall } from '../calls/jobs.ts';
import { runShell, shellDetails, shellResultText } from '../calls/run-shell.ts';
import { callTimeout } from '../calls/shell-command.ts';
import { shellArgsSchema } from '../calls/shell-tool.ts';
import { createChild, startChild, subagentCall } from '../calls/subagent.ts';
import type { SessionTools } from '../prompt/session-prompt.ts';
import { callInfos, isQuery, loadedExtensions } from '../registry/loaded.ts';
import type { HeldResult, JsonValue, SessionDoc } from '../schemas/records.ts';
import { now } from '../sessions/session-lookup.ts';
import { records } from '../store/collections.ts';

// How one call of a reply runs (plan 08 §8.3): a connector call through kvcoder, a connector word in shell syntax
// refused, and anything else in the real shell, after approval when `kvcoder.shell.approval` is `ask`. A call either
// returns its result now, or waits on the person or on a subagent.

export type ToolCall = { id: string; name: string; arguments: Record<string, JsonValue> };

export type CallOutcome =
  | { kind: 'result'; held: HeldResult }
  | { kind: 'question'; questionKind: QuestionKind; question: Record<string, JsonValue> }
  | { kind: 'subagent'; childSessionId: string };

export type CallEnv = { ctx: Ctx; session: Stored<SessionDoc>; tools: SessionTools; approval: 'ask' | 'auto'; answerSeq: number };

const result = (toolCallId: string, call: CallResult, details: JsonValue = null): CallOutcome => ({
  kind: 'result',
  held: { toolCallId, text: resultText(call.output, call.exitCode), details, isError: call.exitCode !== 0, run: null },
});

async function shellOutcome(env: CallEnv, call: ToolCall, labelled: { title: string; description: string; command: string }, timeoutMs: number): Promise<CallOutcome> {
  const run = await runShell(env.tools.shell, labelled.command, env.ctx.job.workspace.path, timeoutMs, env.ctx.job.signal);
  return { kind: 'result', held: { toolCallId: call.id, text: shellResultText(run, timeoutMs), details: shellDetails(labelled, run), isError: run.exitCode !== 0, run: null } };
}

async function connectorOutcome(env: CallEnv, call: ToolCall, line: string, parsed: { connector: string; words: string[]; stdin: string | null; async: boolean }): Promise<CallOutcome> {
  const { ctx, session, tools } = env;
  if (!tools.allowed.has(parsed.connector)) return result(call.id, errorOutput({ code: 'VALIDATION_FAILED', message: `${parsed.connector} isn't available in this subagent.` }));
  if (parsed.connector === 'ask') {
    const asked = askCall(parsed.words, parsed.stdin);
    return 'output' in asked ? result(call.id, asked) : { kind: 'question', questionKind: asked.kind, question: asked.question };
  }
  if (parsed.connector === 'jobs') return result(call.id, await jobsCall(ctx, session.id, parsed.words));
  if (parsed.connector === 'subagent') {
    const run = subagentCall(parsed.words, parsed.stdin, tools.allowed);
    if ('output' in run) return result(call.id, run);
    const childId = await createChild(ctx, session, run, env.answerSeq);
    if (!parsed.async) return { kind: 'subagent', childSessionId: childId };
    await records(ctx.store).background.insert({ sessionId: session.id, ref: childId, kind: 'subagent', call: line, startedAt: now() });
    await startChild(ctx, childId);
    return result(call.id, { output: `started ${childId}`, exitCode: 0 });
  }
  const connector = tools.connectors.find((candidate) => candidate.name === parsed.connector);
  const commands = connector?.commands ?? [];
  const target = parsed.async ? commands.find((command) => command.name === parsed.words[0]) : undefined;
  if (target !== undefined && parsed.words[1] !== '-h') {
    if (isQuery(await loadedExtensions(ctx), target.command)) return result(call.id, errorOutput({ code: 'VALIDATION_FAILED', message: `${parsed.connector} ${target.name} reads only, so it can't run with --async.` }));
    return asyncOutcome(env, call, line, target.command, parsed);
  }
  const deps = { exec: (name: string, input: Record<string, JsonValue>) => ctx.exec(name, input), commands: async () => callInfos(await loadedExtensions(ctx)) };
  return result(call.id, await runCommandsCall(deps, { name: parsed.connector, description: connector?.description ?? '', commands }, parsed.words, parsed.stdin));
}

async function asyncOutcome(env: CallEnv, call: ToolCall, line: string, command: string, parsed: { connector: string; words: string[]; stdin: string | null }): Promise<CallOutcome> {
  const input = callInput(parsed.words, parsed.stdin, parsed.connector);
  if ('output' in input) return result(call.id, input);
  const jobId = await env.ctx.execAsync('kvcoder.connector.run', { sessionId: env.session.id, call: line, command, input: input.input });
  await records(env.ctx.store).background.insert({ sessionId: env.session.id, ref: jobId, kind: 'connector', call: line, startedAt: now() });
  return result(call.id, { output: `started ${jobId}`, exitCode: 0 });
}

export async function evaluateCall(env: CallEnv, call: ToolCall): Promise<CallOutcome> {
  const args = shellArgsSchema.safeParse(call.arguments);
  if (call.name !== env.tools.shell.toolName || !args.success) {
    const problems = args.success ? `the tool is ${env.tools.shell.toolName}, not ${call.name}` : args.error.issues.map((issue) => `${issue.path.join('.') || 'arguments'}: ${issue.message}`).join('; ');
    return result(call.id, errorOutput({ code: 'VALIDATION_FAILED', message: `The call's arguments are invalid: ${problems}.` }));
  }
  const line = args.data.command;
  const words = new Set([...builtinConnectors, ...env.tools.connectors.filter((connector) => connector.kind === 'commands').map((connector) => connector.name)]);
  const parsed = parseLine(line, words);
  if (parsed.kind === 'refused') return result(call.id, { output: refusedText(parsed.connector), exitCode: 1 });
  if (parsed.kind === 'call') return connectorOutcome(env, call, line, parsed);
  if (!env.session.shell) return result(call.id, errorOutput({ code: 'VALIDATION_FAILED', message: 'shell calls are off for this subagent' }));
  const timeoutMs = callTimeout(args.data.timeoutMs);
  if (env.approval === 'ask') return { kind: 'question', questionKind: 'approval', question: { title: args.data.title, command: line, description: args.data.description, timeoutMs } };
  return shellOutcome(env, call, args.data, timeoutMs);
}

/** Runs an approved shell call held in the turn. */
export async function runApproved(ctx: Ctx, tools: Pick<SessionTools, 'shell'>, held: HeldResult): Promise<HeldResult> {
  if (held.run === null) return held;
  const run = await runShell(tools.shell, held.run.command, ctx.job.workspace.path, held.run.timeoutMs, ctx.job.signal);
  return { toolCallId: held.toolCallId, text: shellResultText(run, held.run.timeoutMs), details: shellDetails(held.run, run), isError: run.exitCode !== 0, run: null };
}

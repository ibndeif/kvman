import type { Ctx, Stored } from '@kvman/sdk';
import { builtinConnectors, callInput, errorOutput, parseLine, refusedText, resultText, runCommandsCall, type CallResult } from '../connector-line.ts';
import { askCall, type QuestionKind } from '../calls/ask.ts';
import { filesCall } from '../calls/files.ts';
import { jobsCall } from '../calls/jobs.ts';
import { runShellCall } from '../calls/run-shell-call.ts';
import { callTimeout } from '../calls/shell-command.ts';
import { shellArgsSchema, type ShellArgs } from '../calls/shell-tool.ts';
import { createChild, startChild, subagentCall } from '../calls/subagent.ts';
import type { SessionTools } from '../prompt/session-prompt.ts';
import { callInfos, isQuery, loadedExtensions } from '../registry/loaded.ts';
import type { HeldResult, JsonValue, SessionDoc } from '../schemas/records.ts';
import { now } from '../sessions/session-lookup.ts';
import { records } from '../store/collections.ts';

// How one call of a reply runs (plan 08 §8.3): a connector call through kvcoder, a connector word in shell syntax
// refused, and anything else in the real shell. A real shell call and a `files` call ask the person first when
// `kvcoder.shell.approval` is `ask`, or when the model marked the call risky (ADR 0009, 161). A call either returns
// its result now, or waits on the person or on a subagent.

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

const asks = (env: CallEnv, args: ShellArgs): boolean => env.approval === 'ask' || args.risky;

const isHelp = (words: readonly string[]): boolean => words.length === 1 && words[0] === '-h';

function approval(args: ShellArgs, line: string, mode: 'sync' | 'async', timeoutMs: number): CallOutcome {
  return { kind: 'question', questionKind: 'approval', question: { title: args.title, command: line, description: args.description, mode, timeoutMs } };
}

async function shellOutcome(env: CallEnv, call: ToolCall, shell: { title: string; description: string; command: string; mode?: 'sync' | 'async' | undefined }, timeoutMs: number): Promise<CallOutcome> {
  const run = await runShellCall(env.ctx, env.session.id, env.tools.shell, { ...shell, timeoutMs });
  return { kind: 'result', held: { toolCallId: call.id, ...run, run: null } };
}

async function connectorOutcome(env: CallEnv, call: ToolCall, line: string, parsed: { connector: string; words: string[]; stdin: string | null; async: boolean }): Promise<CallOutcome> {
  const { ctx, session, tools } = env;
  if (!tools.allowed.has(parsed.connector)) return result(call.id, errorOutput({ code: 'VALIDATION_FAILED', message: `${parsed.connector} isn't available in this subagent.` }));
  if (parsed.connector === 'ask') {
    const asked = askCall(parsed.words, parsed.stdin);
    return 'output' in asked ? result(call.id, asked) : { kind: 'question', questionKind: asked.kind, question: asked.question };
  }
  if (parsed.connector === 'jobs') return result(call.id, await jobsCall(ctx, session.id, parsed.words));
  if (parsed.connector === 'files') return result(call.id, await filesCall(ctx, parsed.words, parsed.stdin));
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
  const timeoutMs = callTimeout(args.data.timeoutMs);
  if (parsed.kind === 'call') {
    const files = parsed.connector === 'files' && env.tools.allowed.has('files') && !isHelp(parsed.words);
    return files && asks(env, args.data) ? approval(args.data, line, 'sync', timeoutMs) : connectorOutcome(env, call, line, parsed);
  }
  if (!env.session.shell) return result(call.id, errorOutput({ code: 'VALIDATION_FAILED', message: 'shell calls are off for this subagent' }));
  if (asks(env, args.data)) return approval(args.data, line, args.data.mode ?? 'sync', timeoutMs);
  return shellOutcome(env, call, args.data, timeoutMs);
}

/** Runs an approved shell or `files` call held in the turn. */
export async function runApproved(ctx: Ctx, tools: Pick<SessionTools, 'shell'>, sessionId: string, held: HeldResult): Promise<HeldResult> {
  if (held.run === null) return held;
  const line = parseLine(held.run.command, new Set(['files']));
  if (line.kind === 'call') {
    const done = await filesCall(ctx, line.words, line.stdin);
    return { toolCallId: held.toolCallId, text: resultText(done.output, done.exitCode), details: null, isError: done.exitCode !== 0, run: null };
  }
  return { toolCallId: held.toolCallId, ...(await runShellCall(ctx, sessionId, tools.shell, held.run)), run: null };
}

import { z, type Ctx, type Stored } from '@kvman/sdk';
import { chatIdOf } from '../artifacts/artifact-records.ts';
import { lineRunIsError, lineRunSchema, lineRunText } from '../calls/line-run.ts';
import { artifactCard } from '../connectors/artifact.ts';
import { binaryExec } from '../connectors/binary.ts';
import { builtinCommands, builtinSignatures, commandsOf } from '../connectors/builtin-connectors.ts';
import { payloadJsonSchema, type ConnectorCommand } from '../connectors/connector-command.ts';
import type { RunCall } from '../calls/run-tool.ts';
import { inOrder } from '../files/file-queue.ts';
import { lexicalPath } from '../files/workspace-path.ts';
import { builtinConnectors, errorOutput, jsonOutput, runCommand, type JsonValue } from '../connector-call.ts';
import { callInfos } from '../registry/loaded.ts';
import type { ConnectorRow } from '../registry/register-connectors.ts';
import { truncate } from '../result-text.ts';
import type { HeldResult, SessionDoc } from '../schemas/records.ts';

// Running one connector command for the model (plan 08 §8.3, ADR 0011, 10 and 11): every command, kvcoder's own or a
// registered one, is a kernel command or query run with `ctx.exec`. The result is what the model reads, and the
// `details` the call card shows.

/** A call's result before it is held for its tool call. */
export type CallDone = Pick<HeldResult, 'text' | 'details' | 'isError'>;

/** The kernel job behind a connector command; `builtin` is set for kvcoder's own. */
export type CommandTarget = { registration: string; builtin?: ConnectorCommand };

/** The job a call's connector command runs, or `undefined` when the connector has no such command. */
export function targetOf(connectors: readonly ConnectorRow[], call: Pick<RunCall, 'connector' | 'command'>): CommandTarget | undefined {
  const builtin = builtinConnectors.find((name) => name === call.connector);
  if (builtin !== undefined) {
    const entry = commandsOf(builtin)[call.command];
    return entry === undefined ? undefined : { registration: entry.registration, builtin: entry };
  }
  const connector = connectors.find((candidate) => candidate.name === call.connector);
  if (connector?.kind === 'binary') return call.command === 'exec' ? { registration: binaryExec.registration, builtin: binaryExec } : undefined;
  const command = connector?.commands?.find((candidate) => candidate.name === call.command);
  return command === undefined ? undefined : { registration: command.command };
}

/** The commands a connector has, besides `help`, as a failed call lists them: one of kvcoder's own with its payload's signature (ADR 0012, 19). */
export function commandNamesOf(connectors: readonly ConnectorRow[], name: string): string[] {
  const builtin = builtinConnectors.find((candidate) => candidate === name);
  if (builtin !== undefined) return Object.keys(commandsOf(builtin)).map((command, index) => `${command} ${builtinSignatures[builtin][index] ?? ''}`.trimEnd());
  const connector = connectors.find((candidate) => candidate.name === name);
  return connector?.kind === 'binary' ? ['exec'] : (connector?.commands ?? []).map((command) => command.name);
}

const shellRun = builtinCommands.shell.exec.registration;
const artifactChanges = new Set([builtinCommands.artifact.write.registration, builtinCommands.artifact.edit.registration]);
const artifactCalls = new Set([...artifactChanges, builtinCommands.artifact.get.registration]);
const fileChanges = new Set([builtinCommands.fs.write.registration, builtinCommands.fs.edit.registration]);

// What a call must wait its turn on (plan 08 §8.5, ADR 0009, 160): the calls of a reply start together, and two edits
// that each read the original would lose the first one's write. The key is taken as the calls start, in the model's order.
function orderKey(ctx: Ctx, session: Stored<SessionDoc>, call: RunCall, target: CommandTarget): string | undefined {
  const { path: file, id } = call.payload;
  if (fileChanges.has(target.registration) && typeof file === 'string') return `fs:${lexicalPath(ctx.job.workspace.path, file)}`;
  return artifactCalls.has(target.registration) && typeof id === 'string' ? `artifact:${chatIdOf(session)}:${id}` : undefined;
}

// A built-in command's job takes the chat and the payload; a line in the real shell also takes the words that name a
// background run, and a binary its connector. A registered command takes the payload as its whole input.
function jobInput(sessionId: string, call: RunCall, target: CommandTarget): Record<string, JsonValue> {
  if (target.builtin === undefined) return call.payload;
  const input = { sessionId, payload: call.payload };
  if (target.registration === shellRun) return { ...input, description: call.description };
  return target.registration === binaryExec.registration ? { ...input, description: call.description, connector: call.connector } : input;
}

const words = (call: RunCall) => ({ description: call.description, connector: call.connector, command: call.command });

/** A call that failed before or while it ran: the error the model reads. */
export function failedCall(call: RunCall, output: string, durationMs = 0): CallDone {
  return { text: output, isError: true, details: { ...words(call), output, durationMs } };
}

/** A call whose result is plain text, such as help. */
export function textResult(call: RunCall, text: string, durationMs = 0): CallDone {
  return { text, isError: false, details: { ...words(call), output: text, durationMs } };
}

/** Runs a connector command through `ctx.exec`, after the calls before it on the same file or artifact, and gives what the model and the call card get. */
export function runTarget(ctx: Ctx, session: Stored<SessionDoc>, call: RunCall, target: CommandTarget): Promise<CallDone> {
  const key = orderKey(ctx, session, call, target);
  return key === undefined ? runJob(ctx, session.id, call, target) : inOrder(key, () => runJob(ctx, session.id, call, target));
}

async function runJob(ctx: Ctx, sessionId: string, call: RunCall, target: CommandTarget): Promise<CallDone> {
  const started = Date.now();
  const builtin = target.builtin;
  const done = await runCommand({
    connector: call.connector,
    command: call.command,
    payloadPath: builtin === undefined ? '' : 'payload',
    exec: () => ctx.exec(target.registration, jobInput(sessionId, call, target)),
    payloadSchema: async () => (builtin === undefined ? (await callInfos(ctx)).find((info) => info.name === target.registration)?.input : payloadJsonSchema(builtin.payload)),
    cancelled: () => ctx.job.signal.aborted,
  });
  if (!done.ok) return failedCall(call, done.result.output, Date.now() - started);
  if (target.registration === shellRun || target.registration === binaryExec.registration) {
    const run = lineRunSchema.parse(done.value);
    const details = { ...words(call), output: run.output, durationMs: run.durationMs, ...(run.exitCode === null ? {} : { exitCode: run.exitCode }), ...(run.timedOut ? { timedOut: true } : {}), ...(run.jobId === null ? {} : { background: true, jobId: run.jobId }) };
    return { text: lineRunText(run), isError: lineRunIsError(run), details };
  }
  const output = jsonOutput(done.value).output;
  const text = builtin?.bounded === true ? output : truncate(output);
  const artifactId = artifactChanges.has(target.registration) ? call.payload['id'] : undefined;
  const artifact = typeof artifactId === 'string' ? await artifactCard(ctx, sessionId, artifactId) : undefined;
  return { text, isError: false, details: { ...words(call), output: text, durationMs: Date.now() - started, ...(artifact === undefined ? {} : { artifact }) } };
}

const helpSchema = z.object({ text: z.string() });

/** A connector's `help`, or one command's with `{ command }` (plan 08 §8.3). It never asks. */
export async function runHelp(ctx: Ctx, call: RunCall): Promise<CallDone> {
  const { command, ...rest } = call.payload;
  if (Object.keys(rest).length > 0 || (command !== undefined && typeof command !== 'string')) return failedCall(call, errorOutput({ code: 'VALIDATION_FAILED', message: 'help takes { "command"? }.' }).output);
  const started = Date.now();
  const done = await runCommand({
    connector: call.connector,
    command: call.command,
    payloadPath: '',
    exec: () => ctx.exec('kvcoder.connector.help.get', { connector: call.connector, ...(command === undefined ? {} : { command }) }),
    payloadSchema: () => Promise.resolve(undefined),
    cancelled: () => ctx.job.signal.aborted,
  });
  return done.ok ? textResult(call, helpSchema.parse(done.value).text, Date.now() - started) : failedCall(call, done.result.output, Date.now() - started);
}

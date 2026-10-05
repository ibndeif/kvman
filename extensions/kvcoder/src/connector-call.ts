import { ProblemError, z, type Json, type Problem } from '@kvman/sdk';

// How a connector command's result reads to the model (plan 08 §8.3, ADR 0011, 11), shared by kvcoder's turns and by
// `runConnector` in `@kvman/kvcoder/testing`. As an exported subpath, this file imports only the SDK.

/** A JSON value as zod parses it. */
export type JsonValue = z.output<ReturnType<typeof z.json>>;

/** What a connector call returned, and whether it failed (exit code 1). */
export type CallResult = { output: string; exitCode: number };

/** The connectors kvcoder runs itself, in the order the prompt lists them. */
export const builtinConnectors = ['shell', 'fs', 'artifact', 'background', 'ask', 'subagent'] as const;

export type BuiltinConnector = (typeof builtinConnectors)[number];

/** A Problem as a connector call returns it. */
export function errorOutput(problem: Pick<Problem, 'code' | 'message'>): CallResult {
  return { output: `error ${problem.code}: ${problem.message}`, exitCode: 1 };
}

/** A connector command's JSON output, indented by 2 spaces. */
export function jsonOutput(value: unknown): CallResult {
  return { output: JSON.stringify(value ?? null, null, 2), exitCode: 0 };
}

export const noConnectorMessage = (connector: string, names: readonly string[]): string => `There is no connector ${connector}. The connectors are: ${names.join(', ')}.`;

export const noCommandMessage = (connector: string, command: string): string => `${connector} has no command ${command}; call its help.`;

export type PayloadIssue = { path: string; message: string };

/** An invalid payload as the model reads it: each problem, then the command's payload schema, so one correction is enough (ADR 0009, 213). */
export function invalidPayloadOutput(call: { connector: string; command: string }, issues: readonly PayloadIssue[], schema: Json | undefined): CallResult {
  const problems = issues.map((issue) => `${issue.path === '' ? 'payload' : issue.path}: ${issue.message}`).join('; ');
  const shape = schema === undefined ? '' : ` The payload of ${call.connector} ${call.command} is (JSON Schema):\n${JSON.stringify(schema, null, 2)}`;
  return errorOutput({ code: 'VALIDATION_FAILED', message: `${problems}.${shape}` });
}

const kernelIssuesSchema = z.object({ issues: z.array(z.object({ path: z.string(), message: z.string() })).min(1) });

// The kernel's issue paths start at the job's input; a built-in command's payload is the input's `payload` field.
function withoutPrefix(path: string, prefix: string): string {
  if (prefix === '') return path;
  if (path === prefix) return '';
  return path.startsWith(`${prefix}.`) ? path.slice(prefix.length + 1) : path;
}

/** One run of a connector's command: how to run it, and how to find its payload schema when the payload doesn't fit. */
export type CommandRun = {
  connector: string;
  command: string;
  /** Where the payload sits in the job's input: `payload` for a built-in command, nothing for a registered one. */
  payloadPath: string;
  exec(): Promise<unknown>;
  payloadSchema(): Promise<Json | undefined>;
  /** Whether the calling job was cancelled, so its Problem is rethrown instead of returned. */
  cancelled(): boolean;
};

/** Runs a connector's command: its output, or the failure the model reads. */
export async function runCommand(run: CommandRun): Promise<{ ok: true; value: unknown } | { ok: false; result: CallResult }> {
  try {
    return { ok: true, value: await run.exec() };
  } catch (error) {
    if (!(error instanceof ProblemError) || run.cancelled()) throw error;
    const invalid = error.problem.code === 'VALIDATION_FAILED' ? kernelIssuesSchema.safeParse(error.problem.params) : undefined;
    if (invalid?.success !== true) return { ok: false, result: errorOutput(error.problem) };
    const issues = invalid.data.issues.map((issue) => ({ path: withoutPrefix(issue.path, run.payloadPath), message: issue.message }));
    return { ok: false, result: invalidPayloadOutput(run, issues, await run.payloadSchema()) };
  }
}

const connectorListSchema = z.array(z.object({ name: z.string(), kind: z.enum(['commands', 'binary']), commands: z.array(z.object({ name: z.string(), command: z.string() })).exactOptional() }));
const registrationSchema = z.object({ name: z.string(), input: z.json() });
const extensionsSchema = z.array(z.object({ commands: z.array(registrationSchema), queries: z.array(registrationSchema) }));
const helpSchema = z.object({ text: z.string() });

/** The test kernel `runConnector` needs: `@kvman/testkit`'s, with kvcoder loaded. */
export type ConnectorKernel = { exec(name: string, input: Record<string, Json>, options?: { as?: string; workspaceId?: string }): Promise<unknown> };

/** A call as the `run` tool makes it, without its description. */
export type ConnectorCall = { connector: string; command: string; payload?: Record<string, Json> };

const insideTurn = (connector: string): CallResult => ({ output: `${connector} runs only inside a turn`, exitCode: 1 });

/** Runs a call exactly as kvcoder does, for commands connectors and every connector's `help` (ADR 0009, 96; ADR 0011, 18). */
export async function runConnector(kernel: ConnectorKernel, call: ConnectorCall, options: { workspaceId?: string } = {}): Promise<CallResult> {
  const as = { as: '@kvman/kvcoder', ...options };
  const payload = call.payload ?? {};
  if (call.command === 'help') {
    const asked = typeof payload['command'] === 'string' ? { command: payload['command'] } : {};
    try {
      return { output: helpSchema.parse(await kernel.exec('kvcoder.connector.help.get', { connector: call.connector, ...asked }, as)).text, exitCode: 0 };
    } catch (error) {
      if (error instanceof ProblemError) return errorOutput(error.problem);
      throw error;
    }
  }
  if (builtinConnectors.some((name) => name === call.connector)) return insideTurn(call.connector);
  const connectors = connectorListSchema.parse(await kernel.exec('kvcoder.connector.list', {}, as));
  const connector = connectors.find((candidate) => candidate.name === call.connector);
  if (connector === undefined) return errorOutput({ code: 'VALIDATION_FAILED', message: noConnectorMessage(call.connector, [...builtinConnectors, ...connectors.map((candidate) => candidate.name)]) });
  if (connector.kind === 'binary') return insideTurn(call.connector);
  const target = connector.commands?.find((candidate) => candidate.name === call.command);
  if (target === undefined) return errorOutput({ code: 'NOT_FOUND', message: noCommandMessage(call.connector, call.command) });
  const done = await runCommand({
    connector: call.connector,
    command: call.command,
    payloadPath: '',
    exec: () => kernel.exec(target.command, payload, as),
    payloadSchema: async () => extensionsSchema.parse(await kernel.exec('kernel.extensions.list', {}, as)).flatMap((extension) => [...extension.commands, ...extension.queries]).find((registered) => registered.name === target.command)?.input,
    cancelled: () => false,
  });
  return done.ok ? jsonOutput(done.value) : done.result;
}

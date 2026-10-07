import { ProblemError, z, type Json, type Problem } from '@kvman/sdk';

// How a connector command's result reads to the model (plan 08 §8.3, ADR 0011, 11), shared by kvcoder's turns and by
// `runConnector` in `@kvman/kvcoder/testing`. As an exported subpath, this file imports only the SDK.

/** A JSON value as zod parses it. */
export type JsonValue = z.output<ReturnType<typeof z.json>>;

/** What a connector call returned, and whether it failed (exit code 1). */
export type CallResult = { output: string; exitCode: number };

/** The connectors kvcoder runs itself, in the order the prompt lists them. */
export const builtinConnectors = ['shell', 'fs', 'artifact', 'background', 'ask', 'delegate', 'mcp'] as const;

export type BuiltinConnector = (typeof builtinConnectors)[number];

/** A Problem as a connector call returns it. */
export function errorOutput(problem: Pick<Problem, 'code' | 'message'>): CallResult {
  return { output: `error ${problem.code}: ${problem.message}`, exitCode: 1 };
}

/** A connector command's JSON output, with no indentation (ADR 0034, 4). */
export function jsonOutput(value: unknown): CallResult {
  return { output: JSON.stringify(value ?? null), exitCode: 0 };
}

export const noConnectorMessage = (connector: string, names: readonly string[]): string => `There is no connector ${connector}. The connectors are: ${names.join(', ')}.`;

const shownCommandLength = 40;

/** A connector has no such command: the message names the ones it has, and cuts a long wrong name, which is usually a shell line (ADR 0012, 19). */
export function noCommandMessage(connector: string, command: string, commands: readonly string[]): string {
  const shown = command.length > shownCommandLength ? `${command.slice(0, shownCommandLength)}…` : command;
  return `${connector} has no command ${shown}. Its commands are: ${[...commands, 'help'].join(', ')}.`;
}

export type PayloadIssue = { path: string; message: string };

// A payload's schema as a signature can be written from it: enough of the JSON Schema's shape for the walk, with
// everything else kept. Recursive, since an object's fields have schemas too.
type Field = {
  type?: string | undefined;
  enum?: Json[] | undefined;
  properties?: Record<string, Field> | undefined;
  required?: string[] | undefined;
  items?: Field | undefined;
};

const field: z.ZodType<Field> = z.lazy(() =>
  z.looseObject({
    type: z.string().optional(),
    enum: z.array(z.json()).optional(),
    properties: z.record(z.string(), field).optional(),
    required: z.array(z.string()).optional(),
    items: field.optional(),
  }),
);

// The top of a payload's schema: an object with properties, as the kernel's `z.toJSONSchema` writes it.
const payloadObject = z.looseObject({ type: z.literal('object'), properties: z.record(z.string(), field), required: z.array(z.string()).optional() });

function objectSignature(schema: Field): string {
  const entries = Object.entries(schema.properties ?? {});
  if (entries.length === 0) return '{}';
  const required = new Set(schema.required ?? []);
  return `{ ${entries.map(([name, child]) => fieldSignature(name, child, required.has(name))).join(', ')} }`;
}

function fieldSignature(name: string, schema: Field, required: boolean): string {
  const mark = required ? '' : '?';
  if (schema.properties !== undefined) return `${name}${mark}: ${objectSignature(schema)}`;
  if (schema.type === 'array' && schema.items?.properties !== undefined) return `${name}${mark}: [${objectSignature(schema.items)}]`;
  if (schema.enum !== undefined && schema.enum.length > 0 && schema.enum.every((value) => typeof value === 'string')) {
    return `${name}${mark}: ${schema.enum.map((value) => JSON.stringify(value)).join(' | ')}`;
  }
  return `${name}${mark}`;
}

/** A payload's signature written from its JSON Schema, such as `{ a, b?, c: [{ x }] }`; `undefined` when the schema isn't an object with properties. */
export function payloadSignature(schema: Json | undefined): string | undefined {
  if (schema === undefined) return undefined;
  const parsed = payloadObject.safeParse(schema);
  return parsed.success ? objectSignature(parsed.data) : undefined;
}

function withoutSchemaKey(schema: Json): Json {
  if (typeof schema !== 'object' || schema === null || Array.isArray(schema)) return schema;
  return Object.fromEntries(Object.entries(schema).filter(([key]) => key !== '$schema'));
}

/** An invalid payload as the model reads it: each problem, then the command's signature so one correction is enough (ADR 0012, 2 to 4). */
export function invalidPayloadOutput(call: { connector: string; command: string }, issues: readonly PayloadIssue[], schema: Json | undefined): CallResult {
  const problems = issues.map((issue) => `${issue.path === '' ? 'payload' : issue.path}: ${issue.message}`).join('; ');
  let shape = '';
  if (schema !== undefined) {
    const signature = payloadSignature(schema);
    shape = signature === undefined ? ` The payload of ${call.connector} ${call.command} is (JSON Schema):\n${JSON.stringify(withoutSchemaKey(schema))}` : ` The payload of ${call.connector} ${call.command} is\n${signature}`;
  }
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
  if (target === undefined) return errorOutput({ code: 'NOT_FOUND', message: noCommandMessage(call.connector, call.command, (connector.commands ?? []).map((candidate) => candidate.name)) });
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

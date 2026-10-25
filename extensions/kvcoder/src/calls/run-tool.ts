import { z } from '@kvman/sdk';
import type { JsonValue } from '../connector-call.ts';

// The agent's one tool (plan 08 §8.2, ADR 0011, 1; ADR 0089, 1): `run { connector, command, payload }` runs one command
// of a connector. The payload has no schema here: the model learns it from the prompt's connector index or the connector's `help`.

const exampleCall = '{ "connector": "fs", "command": "list", "payload": { "path": "src" } }';

export function runTool(connectors: readonly string[]) {
  return {
    name: 'run',
    description: [
      'Runs one command of a connector and returns its result. Connectors are the only way you act: the system prompt lists each one with its commands.',
      '',
      'Make every independent call in the same reply, as several run calls: reads and searches run at the same time, and each reply is a step that sends the whole conversation again.',
      '',
      `For example, ${exampleCall}. Every connector has the command help: call it with an empty payload to see the connector's commands, or with { "command": "<name>" } to see one command's payload, before the first time you use a command whose payload the system prompt doesn't list.`,
    ].join('\n'),
    parameters: {
      type: 'object',
      properties: {
        connector: { type: 'string', enum: [...connectors], description: 'The connector to use.' },
        command: { type: 'string', description: "One of the connector's commands, or help." },
        payload: { type: 'object', description: "The command's input, as the system prompt or the connector's help gives it. Leave it out for a command that takes none." },
      },
      required: ['connector', 'command'],
      additionalProperties: false,
    },
  };
}

const payloadSchema = z.record(z.string(), z.json());

const argsSchema = z.strictObject({
  connector: z.string().min(1),
  command: z.string().min(1),
  payload: payloadSchema.default({}),
});

/** A call as the model made it: the connector command with its payload. */
export type RunCall = z.output<typeof argsSchema>;

// What each argument must be, as a failed call says it.
const requirements: Record<string, string> = {
  connector: "one of the session's connectors",
  command: "one of the connector's commands, or help",
  payload: "a JSON object: the command's input",
};

// A payload some models send as a JSON string is read as the object it holds.
function withParsedPayload(raw: Record<string, JsonValue>): Record<string, JsonValue> {
  if (typeof raw['payload'] !== 'string') return raw;
  try {
    return { ...raw, payload: z.json().parse(JSON.parse(raw['payload'])) };
  } catch (error) {
    if (error instanceof SyntaxError) return raw;
    throw error;
  }
}

export type ParsedRunArgs = { success: true; data: RunCall } | { success: false; problems: string };

const named = new Set(['connector', 'command', 'payload', 'description']);
const lineCommands = new Set(['exec', 'help']);

// Shapes models often send, made into the call they meant (ADR 0102, 5): a payload key beside the payload, a
// `functions.` prefix on the connector, and a shell line, or a program's arguments, sent as the command.
function repaired(raw: Record<string, JsonValue>, lineConnectors: ReadonlySet<string>): Record<string, JsonValue> {
  const payload = raw['payload'] === undefined ? {} : raw['payload'];
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return raw;
  const moved: Record<string, JsonValue> = { ...payload };
  const kept: Record<string, JsonValue> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (named.has(key)) kept[key] = value;
    else if (key in moved) kept[key] = value;
    else moved[key] = value;
  }
  const connector = typeof raw['connector'] === 'string' ? raw['connector'].replace(/^functions\./, '') : raw['connector'];
  const command = raw['command'];
  const field = connector === 'shell' ? 'line' : 'args';
  if (typeof connector === 'string' && lineConnectors.has(connector) && typeof command === 'string' && !lineCommands.has(command) && !(field in moved)) {
    return { ...kept, connector, command: 'exec', payload: { ...moved, [field]: command } };
  }
  return { ...kept, ...(connector === undefined ? {} : { connector }), ...(raw['payload'] === undefined && Object.keys(moved).length === 0 ? {} : { payload: moved }) };
}

/** A `run` call's arguments as they are stored and sent again: repaired when the repair makes a valid call, else as they came. */
export function repairedArguments(raw: Record<string, JsonValue>, lineConnectors: ReadonlySet<string>): Record<string, JsonValue> {
  const fixed = repaired(withParsedPayload(raw), lineConnectors);
  return argsSchema.safeParse(fixed).success ? fixed : raw;
}

/**
 * A call's arguments, or what is wrong with them and what each field must be. `lineConnectors` are the connectors
 * that run a line (`shell` and the binary ones), whose command may come as the line itself.
 */
export function parseRunArgs(raw: Record<string, JsonValue>, lineConnectors: ReadonlySet<string> = new Set(['shell'])): ParsedRunArgs {
  const parsed = argsSchema.safeParse(repaired(withParsedPayload(raw), lineConnectors));
  if (parsed.success) return { success: true, data: parsed.data };
  const problems = parsed.error.issues.map((issue) => {
    const field = String(issue.path[0] ?? 'arguments');
    const needed = requirements[field];
    const message = field === 'payload' ? 'The payload must be a JSON object' : issue.message;
    return `${issue.path.join('.') || 'arguments'}: ${message}${needed === undefined ? '' : ` (it must be ${needed})`}`;
  });
  return { success: false, problems: problems.join('; ') };
}

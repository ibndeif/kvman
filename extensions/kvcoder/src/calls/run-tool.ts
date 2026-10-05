import { z } from '@kvman/sdk';
import type { JsonValue } from '../connector-call.ts';

// The agent's one tool (plan 08 §8.2, ADR 0011, 1): `run { description, connector, command, payload }` runs one command
// of a connector. The payload has no schema here: the model learns it from the prompt's connector index or the connector's `help`.

const exampleCall = '{ "description": "Listing the project\'s source files", "connector": "fs", "command": "list", "payload": { "path": "src" } }';

export function runTool(connectors: readonly string[]) {
  return {
    name: 'run',
    description: [
      'Runs one command of a connector and returns its result. Connectors are the only way you act: the system prompt lists each one with its commands.',
      '',
      `For example, ${exampleCall}. Every connector has the command help: call it with an empty payload to see the connector's commands, or with { "command": "<name>" } to see one command's payload, before the first time you use a command whose payload the system prompt doesn't list.`,
    ].join('\n'),
    parameters: {
      type: 'object',
      properties: {
        description: { type: 'string', description: 'One sentence saying what this call does, for a person who knows nothing about how you work ("Editing app.ts to add the save button"). Write it first.' },
        connector: { type: 'string', enum: [...connectors], description: 'The connector to use.' },
        command: { type: 'string', description: "One of the connector's commands, or help." },
        payload: { type: 'object', description: "The command's input, as the system prompt or the connector's help gives it. Leave it out for a command that takes none." },
      },
      required: ['description', 'connector', 'command'],
      additionalProperties: false,
    },
  };
}

const payloadSchema = z.record(z.string(), z.json());

const argsSchema = z.strictObject({
  description: z.string().trim().min(1),
  connector: z.string().min(1),
  command: z.string().min(1),
  payload: payloadSchema.default({}),
});

/** A call as the model made it: what it says to the person, and the connector command with its payload. */
export type RunCall = z.output<typeof argsSchema>;

// What each argument must be, as a failed call says it.
const requirements: Record<string, string> = {
  description: 'one sentence saying what this call does, for the person',
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

/** A call's arguments, or what is wrong with them and what each field must be. */
export function parseRunArgs(raw: Record<string, JsonValue>): ParsedRunArgs {
  const parsed = argsSchema.safeParse(withParsedPayload(raw));
  if (parsed.success) return { success: true, data: parsed.data };
  const problems = parsed.error.issues.map((issue) => {
    const field = String(issue.path[0] ?? 'arguments');
    const needed = requirements[field];
    const message = field === 'payload' ? 'The payload must be a JSON object' : issue.message;
    return `${issue.path.join('.') || 'arguments'}: ${message}${needed === undefined ? '' : ` (it must be ${needed})`}`;
  });
  return { success: false, problems: problems.join('; ') };
}

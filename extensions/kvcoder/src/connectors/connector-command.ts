import { z, type Json } from '@kvman/sdk';

// A built-in connector as its own file describes it (plan 08 §8.3, ADR 0011, 10): each command is one of kvcoder's
// private commands or queries, run with `ctx.exec`. `asks` marks the ones the person approves first; `result` says
// what a command returns when that isn't its JSON output, `notes` what its help adds to the payload's own
// descriptions, and `bounded` a command that limits its own result, which is then never cut (ADR 0011, 23).

export type ConnectorCommand = { registration: string; description: string; payload: z.ZodType; asks: boolean; result?: string; notes?: string; bounded?: true };

/** What `shell exec` and a binary's `exec` return. */
export const lineResult = 'the combined output, then [exit code N].';

/** A payload schema as JSON Schema, the way the kernel shows an input (plan 02 §2.12). */
export function payloadJsonSchema(payload: z.ZodType): Json {
  return z.json().parse(z.toJSONSchema(payload, { io: 'input', unrepresentable: 'any' }));
}

const sessionId = z.string().describe('The chat the call belongs to.');

/** A built-in command's job input: the chat it runs for, and the payload. */
export function callInput<Payload extends z.ZodType>(payload: Payload) {
  return z.strictObject({ sessionId, payload: payload.describe("The command's payload.") });
}

/** The same for a command that runs in the real shell: with the call's description, which names a background run. */
export function lineCallInput<Payload extends z.ZodType>(payload: Payload) {
  return z.strictObject({ sessionId, description: z.string().describe("The call's description, for the person."), payload: payload.describe("The command's payload.") });
}

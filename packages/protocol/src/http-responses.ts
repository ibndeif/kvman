import { z } from 'zod';
import { typeNameSchema, ulidSchema } from './identifiers.ts';
import { jsonSchema } from './json.ts';
import { problemSchema } from './problem.ts';

// The bodies the HTTP adapter answers with (12 §12.2, ADR 0094); a refusal or a failed reply is a Problem.

export const messageStateSchema = z.enum(['pending', 'running', 'awaiting', 'done', 'failed', 'dead', 'cancelled']);

export type MessageStateName = z.infer<typeof messageStateSchema>;

// 200: the handler's result value, in the same response.
export const commandReplyResponseSchema = z.strictObject({ id: ulidSchema, reply: jsonSchema });

export type CommandReplyResponse = z.infer<typeof commandReplyResponseSchema>;

// 202: the handler deferred its reply, or the request ended before it; the reply comes later.
export const commandAcceptedResponseSchema = z.strictObject({ id: ulidSchema, state: messageStateSchema });

export type CommandAcceptedResponse = z.infer<typeof commandAcceptedResponseSchema>;

export const queryResponseSchema = z.strictObject({ data: jsonSchema });

export type QueryResponse = z.infer<typeof queryResponseSchema>;

// GET /messages/:id: `reply` is a successful reply's value, `problem` a failed one's.
export const messageStatusSchema = z.strictObject({
  id: ulidSchema,
  type: typeNameSchema,
  state: messageStateSchema,
  reply: jsonSchema.exactOptional(),
  problem: problemSchema.exactOptional(),
});

export type MessageStatus = z.infer<typeof messageStatusSchema>;

export const subscriptionCreatedSchema = z.strictObject({ sid: z.string().min(1) });

export type SubscriptionCreated = z.infer<typeof subscriptionCreatedSchema>;

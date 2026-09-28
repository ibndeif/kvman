import { z } from 'zod';
import { addressSchema } from './address.ts';
import { epochMsSchema, typeNameSchema, ulidSchema, workspaceIdSchema } from './identifiers.ts';
import { jsonSchema } from './json.ts';
import { liveChunkSchema } from './live-chunk.ts';
import { problemSchema } from './problem.ts';
import { dismissSchema, navigateSchema, notificationSchema, toastSchema } from './ui/notifications.ts';

const countSchema = z.number().int().nonnegative();

function uiStreamMessage<Type extends string, Payload extends z.ZodType>(type: Type, payload: Payload) {
  return z.strictObject({
    clientId: z.string().min(1).exactOptional(), workspaceId: workspaceIdSchema.exactOptional(), type: z.literal(type), source: addressSchema, payload,
  });
}

export const streamedEventSchema = z.strictObject({
  id: ulidSchema, type: typeNameSchema, source: addressSchema, workspaceId: workspaceIdSchema.exactOptional(), payload: jsonSchema,
  correlationId: ulidSchema, causationId: ulidSchema.exactOptional(), createdAt: epochMsSchema,
});

export const sseMessageSchemas = {
  hello: z.strictObject({
    userId: z.string().min(1), cursor: countSchema, protocolVersion: z.number().int().positive(), kernelVersion: z.string().min(1),
    subscriptions: z.array(z.string().min(1)), notifications: z.strictObject({ unread: countSchema, attention: countSchema }),
  }),
  event: z.strictObject({ sid: z.string().min(1), seq: countSchema, event: streamedEventSchema }),
  live: z.strictObject({
    sid: z.string().min(1), type: typeNameSchema, key: z.string().min(1), run: ulidSchema, n: countSchema, chunk: liveChunkSchema,
  }),
  reply: z.union([
    z.strictObject({ clientId: z.string().min(1), id: ulidSchema, ok: z.literal(true), data: jsonSchema }),
    z.strictObject({ clientId: z.string().min(1), id: ulidSchema, ok: z.literal(false), problem: problemSchema }),
  ]),
  // ADR 0163: `workspaceId` is the message's workspace (absent = global), so the shell picks the tabs that show it.
  ui: z.union([
    uiStreamMessage('ui.toast', toastSchema),
    uiStreamMessage('ui.notify', notificationSchema),
    uiStreamMessage('ui.dismiss', dismissSchema),
    uiStreamMessage('ui.navigate', navigateSchema),
  ]),
  resync: z.strictObject({ reason: z.enum(['cursor-expired', 'cursor-unknown']) }),
  close: z.strictObject({ reason: z.enum(['slow-consumer', 'shutdown']) }),
} as const;

export type SseMessageName = keyof typeof sseMessageSchemas;

export type SseMessage<Name extends SseMessageName> = z.infer<(typeof sseMessageSchemas)[Name]>;

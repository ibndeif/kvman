import { z } from 'zod';
import { addressSchema } from './address.ts';
import { epochMsSchema, typeNameSchema, ulidSchema, workspaceIdSchema } from './identifiers.ts';
import { jsonSchema } from './json.ts';
import { liveChunkSchema } from './live-chunk.ts';
import { problemSchema } from './problem.ts';
import { dismissSchema, navigateSchema, notificationSchema, toastSchema } from './ui/notifications.ts';

const countSchema = z.number().int().nonnegative();

export const streamedEventSchema = z.strictObject({
  id: ulidSchema, type: typeNameSchema, source: addressSchema, workspaceId: workspaceIdSchema.optional(), payload: jsonSchema,
  correlationId: ulidSchema, causationId: ulidSchema.optional(), createdAt: epochMsSchema,
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
  ui: z.union([
    z.strictObject({ clientId: z.string().min(1).optional(), type: z.literal('ui.toast'), source: addressSchema, payload: toastSchema }),
    z.strictObject({ clientId: z.string().min(1).optional(), type: z.literal('ui.notify'), source: addressSchema, payload: notificationSchema }),
    z.strictObject({ clientId: z.string().min(1).optional(), type: z.literal('ui.dismiss'), source: addressSchema, payload: dismissSchema }),
    z.strictObject({ clientId: z.string().min(1).optional(), type: z.literal('ui.navigate'), source: addressSchema, payload: navigateSchema }),
  ]),
  resync: z.strictObject({ reason: z.string().min(1) }),
  close: z.strictObject({ reason: z.enum(['slow-consumer', 'shutdown']) }),
} as const;

export type SseMessageName = keyof typeof sseMessageSchemas;

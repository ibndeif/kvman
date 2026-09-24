import { z } from 'zod';
import { epochMsSchema, typeNameSchema } from './identifiers.ts';
import { jsonObjectSchema, jsonSchema } from './json.ts';
import { onReplySchema, prioritySchema } from './message.ts';

export const storeScopeSchema = z.enum(['workspace', 'global']);
export type StoreScope = z.infer<typeof storeScopeSchema>;

const expectedVersionSchema = z.number().int().nonnegative().exactOptional();
const seqSchema = z.number().int().positive();

export const storeWriteSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('kv.set'), scope: storeScopeSchema, key: z.string().min(1).max(512), value: jsonSchema, expectedVersion: expectedVersionSchema }),
  z.strictObject({ kind: z.literal('kv.delete'), scope: storeScopeSchema, key: z.string().min(1).max(512), expectedVersion: expectedVersionSchema }),
  z.strictObject({
    kind: z.literal('doc.put'), scope: storeScopeSchema, collection: z.string().min(1), id: z.string().min(1), data: jsonObjectSchema,
    expectedVersion: expectedVersionSchema,
  }),
  z.strictObject({ kind: z.literal('doc.delete'), scope: storeScopeSchema, collection: z.string().min(1), id: z.string().min(1), expectedVersion: expectedVersionSchema }),
  z.strictObject({ kind: z.literal('log.append'), scope: storeScopeSchema, log: z.string().min(1), seq: seqSchema, value: jsonSchema }),
  z.strictObject({ kind: z.literal('log.truncate-before'), scope: storeScopeSchema, log: z.string().min(1), seq: seqSchema }),
  z.strictObject({ kind: z.literal('log.drop'), scope: storeScopeSchema, log: z.string().min(1) }),
]);
export type StoreWrite = z.infer<typeof storeWriteSchema>;

export const outboundSendSchema = z.strictObject({
  type: typeNameSchema,
  payload: jsonSchema,
  lane: z.string().min(1).exactOptional(),
  idempotencyKey: z.string().min(1).exactOptional(),
  priority: prioritySchema.exactOptional(),
  deadlineAt: epochMsSchema.exactOptional(),
  delayMs: z.number().int().nonnegative().exactOptional(),
  at: epochMsSchema.exactOptional(),
  context: z.record(z.string(), z.string()).exactOptional(),
  onReply: onReplySchema.exactOptional(),
});
export type OutboundSend = z.infer<typeof outboundSendSchema>;

export const outboundPublishSchema = z.strictObject({ type: typeNameSchema, payload: jsonSchema });
export type OutboundPublish = z.infer<typeof outboundPublishSchema>;

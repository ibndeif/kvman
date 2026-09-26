import { z } from 'zod';
import { addressSchema } from './address.ts';
import { namespaceSchema, packageNameSchema } from './extension/grammar.ts';
import { messageStateSchema } from './http-responses.ts';
import { epochMsSchema, typeNameSchema, typePatternSchema, ulidSchema, workspaceIdSchema } from './identifiers.ts';
import { messageKindSchema, prioritySchema } from './message.ts';
import { textSchema } from './text.ts';

// 03 §3.8, ADR 0132: the admin query over stored messages; items carry no payload or result.
export const messagesListLimits = { defaultLimit: 200, maxLimit: 1000 } as const;

export const messagesListRequestSchema = z.strictObject({
  state: messageStateSchema.exactOptional(),
  type: typeNameSchema.exactOptional(),
  extension: packageNameSchema.exactOptional(),
  workspaceId: workspaceIdSchema.exactOptional(),
  correlationId: ulidSchema.exactOptional(),
  limit: z.number().int().min(1).max(messagesListLimits.maxLimit).exactOptional(),
});
export type MessagesListRequest = z.infer<typeof messagesListRequestSchema>;

export const messageSummarySchema = z.strictObject({
  id: ulidSchema,
  kind: messageKindSchema,
  type: typeNameSchema,
  state: messageStateSchema,
  source: addressSchema,
  handler: z.string(),
  workspaceId: workspaceIdSchema.exactOptional(),
  lane: z.string().exactOptional(),
  priority: prioritySchema,
  attempts: z.number().int().nonnegative(),
  correlationId: ulidSchema,
  causationId: ulidSchema.exactOptional(),
  createdAt: epochMsSchema,
  updatedAt: epochMsSchema,
  deadlineAt: epochMsSchema.exactOptional(),
  notBefore: epochMsSchema.exactOptional(),
});
export type MessageSummary = z.infer<typeof messageSummarySchema>;

export const messagesListResultSchema = z.strictObject({ items: z.array(messageSummarySchema), total: z.number().int().nonnegative() });
export type MessagesListResult = z.infer<typeof messagesListResultSchema>;

// 03 §3.8, ADR 0133: the extensions enabled in a workspace that would receive an event, each with its granted calls.
export const subscribersListRequestSchema = z.strictObject({ workspaceId: workspaceIdSchema, type: typeNameSchema });
export type SubscribersListRequest = z.infer<typeof subscribersListRequestSchema>;

export const subscriberSchema = z.strictObject({
  name: packageNameSchema,
  namespace: namespaceSchema,
  title: textSchema,
  status: z.enum(['active', 'quarantined']),
  calls: z.array(typePatternSchema),
});
export type Subscriber = z.infer<typeof subscriberSchema>;

export const subscribersListResultSchema = z.array(subscriberSchema);
export type SubscribersListResult = z.infer<typeof subscribersListResultSchema>;

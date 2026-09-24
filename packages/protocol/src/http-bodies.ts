import { z } from 'zod';
import { liveAddressSchema, typePatternSchema, workspaceIdSchema } from './identifiers.ts';
import { jsonSchema } from './json.ts';
import { limits } from './limits.ts';
import { prioritySchema } from './message.ts';

export const commandRequestBodySchema = z.strictObject({
  payload: jsonSchema,
  workspaceId: workspaceIdSchema.optional(),
  lane: z.string().min(1).optional(),
  idempotencyKey: z.string().min(1),
  priority: prioritySchema.optional(),
  wait: z.number().int().min(0).max(limits.maxCommandWaitMs).optional(),
});

export type CommandRequestBody = z.infer<typeof commandRequestBodySchema>;

export const queryRequestBodySchema = z.strictObject({
  payload: jsonSchema,
  workspaceId: workspaceIdSchema.optional(),
});

export type QueryRequestBody = z.infer<typeof queryRequestBodySchema>;

export const subscriptionRequestBodySchema = z.strictObject({
  stream: z.string().min(1),
  sid: z.string().min(1),
  events: z.array(typePatternSchema).optional(),
  live: z.array(liveAddressSchema).optional(),
  workspaceId: workspaceIdSchema.optional(),
  since: z.number().int().nonnegative().optional(),
});

export type SubscriptionRequestBody = z.infer<typeof subscriptionRequestBodySchema>;

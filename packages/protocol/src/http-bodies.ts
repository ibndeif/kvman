import { z } from 'zod';
import { liveAddressSchema, typePatternSchema, workspaceIdSchema } from './identifiers.ts';
import { jsonSchema } from './json.ts';
import { limits } from './limits.ts';
import { prioritySchema } from './message.ts';

export const commandRequestBodySchema = z.strictObject({
  payload: jsonSchema,
  workspaceId: workspaceIdSchema.exactOptional(),
  lane: z.string().min(1).exactOptional(),
  idempotencyKey: z.string().min(1),
  priority: prioritySchema.exactOptional(),
  wait: z.number().int().min(0).max(limits.maxCommandWaitMs).exactOptional(),
});

export type CommandRequestBody = z.infer<typeof commandRequestBodySchema>;

export const queryRequestBodySchema = z.strictObject({
  payload: jsonSchema,
  workspaceId: workspaceIdSchema.exactOptional(),
});

export type QueryRequestBody = z.infer<typeof queryRequestBodySchema>;

export const subscriptionRequestBodySchema = z.strictObject({
  stream: z.string().min(1),
  sid: z.string().min(1),
  events: z.array(typePatternSchema).exactOptional(),
  live: z.array(liveAddressSchema).exactOptional(),
  workspaceId: workspaceIdSchema.exactOptional(),
  since: z.number().int().nonnegative().exactOptional(),
});

export type SubscriptionRequestBody = z.infer<typeof subscriptionRequestBodySchema>;

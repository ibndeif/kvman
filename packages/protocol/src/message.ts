import { z } from 'zod';
import { addressSchema } from './address.ts';
import { epochMsSchema, typeNameSchema, ulidSchema, workspaceIdSchema } from './identifiers.ts';
import { jsonSchema } from './json.ts';
import { limits } from './limits.ts';
import { jsonByteLength } from './unicode.ts';

export const messageKindSchema = z.enum(['command', 'query', 'event']);
export type MessageKind = z.infer<typeof messageKindSchema>;

export const eventDeliverySchema = z.enum(['durable', 'transient', 'live']);
export type EventDelivery = z.infer<typeof eventDeliverySchema>;

export const accessSchema = z.enum(['all', 'user', 'extensions', 'internal']);
export type Access = z.infer<typeof accessSchema>;

export const prioritySchema = z.enum(['interactive', 'normal', 'background']);
export type Priority = z.infer<typeof prioritySchema>;

export const messageContextSchema = z
  .record(z.string(), z.string())
  .refine((context) => jsonByteLength(context) <= limits.contextBytes, `context is over ${limits.contextBytes} bytes`);

export const onReplySchema = z.strictObject({ type: typeNameSchema, context: jsonSchema.optional() });
export type OnReply = z.infer<typeof onReplySchema>;

export const messageSchema = z
  .strictObject({
    v: z.literal(1),
    id: ulidSchema,
    kind: messageKindSchema,
    type: typeNameSchema,
    source: addressSchema,
    target: addressSchema.optional(),
    workspaceId: workspaceIdSchema.optional(),
    lane: z.string().min(1).optional(),
    payload: jsonSchema,
    payloadRef: z.string().min(1).optional(),
    correlationId: ulidSchema,
    causationId: ulidSchema.optional(),
    context: messageContextSchema,
    onReply: onReplySchema.optional(),
    idempotencyKey: z.string().min(1).optional(),
    priority: prioritySchema,
    delivery: eventDeliverySchema.optional(),
    deadlineAt: epochMsSchema.optional(),
    notBefore: epochMsSchema.optional(),
    createdAt: epochMsSchema,
  })
  .superRefine((message, check) => {
    if ((message.kind === 'event') !== (message.delivery !== undefined)) {
      check.addIssue({ code: 'custom', path: ['delivery'], message: 'delivery is set on events, and only on events' });
    }
    if (message.target !== undefined && !(message.kind === 'command' && message.type.startsWith('ui.'))) {
      check.addIssue({ code: 'custom', path: ['target'], message: 'target is set only on ui.* commands' });
    }
  });

export type Message = z.infer<typeof messageSchema>;

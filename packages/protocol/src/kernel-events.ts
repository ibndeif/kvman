import { z } from 'zod';
import { typeNameSchema, ulidSchema } from './identifiers.ts';

// The payloads of the kernel's own events (03, kernel events table), added as the milestones that emit them land.
export const messageDeadLetteredSchema = z.strictObject({ messageId: ulidSchema, type: typeNameSchema, correlationId: ulidSchema });

export type MessageDeadLettered = z.infer<typeof messageDeadLetteredSchema>;

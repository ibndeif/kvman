import { z } from 'zod';
import { ulidSchema } from './identifiers.ts';

// The payloads and results of the kernel's own commands (03 §3.8), added as the milestones that build them land.

// 02 §2.9: one message and everything it caused, or a whole correlation.
export const cancelRequestSchema = z.union([z.strictObject({ messageId: ulidSchema }), z.strictObject({ correlationId: ulidSchema })]);

export type CancelRequest = z.infer<typeof cancelRequestSchema>;

export const cancelResultSchema = z.strictObject({ cancelled: z.number().int().nonnegative() });

export type CancelResult = z.infer<typeof cancelResultSchema>;

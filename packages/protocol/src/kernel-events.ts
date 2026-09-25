import { z } from 'zod';
import { typeNameSchema, ulidSchema } from './identifiers.ts';

// The payloads of the kernel's own events (03, kernel events table), added as the milestones that emit them land.
export const messageDeadLetteredSchema = z.strictObject({ messageId: ulidSchema, type: typeNameSchema, correlationId: ulidSchema });

export type MessageDeadLettered = z.infer<typeof messageDeadLetteredSchema>;

// 03 §3.6 and ADR 0081: why an extension is quarantined.
export const quarantineReasonSchema = z.enum(['HOST_FAILURES', 'EXT_INTEGRITY', 'MIGRATION_FAILED', 'EXT_MANIFEST_INVALID']);

export type QuarantineReason = z.infer<typeof quarantineReasonSchema>;

export const extensionQuarantinedSchema = z.strictObject({ name: z.string().min(1), reason: quarantineReasonSchema });

export type ExtensionQuarantined = z.infer<typeof extensionQuarantinedSchema>;

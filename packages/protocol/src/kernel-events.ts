import { z } from 'zod';
import { typeNameSchema, ulidSchema, workspaceIdSchema } from './identifiers.ts';

// The payloads of the kernel's own events (03, kernel events table), added as the milestones that emit them land.
export const messageDeadLetteredSchema = z.strictObject({ messageId: ulidSchema, type: typeNameSchema, correlationId: ulidSchema });

export type MessageDeadLettered = z.infer<typeof messageDeadLetteredSchema>;

// 03 §3.6 and ADR 0081: why an extension is quarantined.
export const quarantineReasonSchema = z.enum(['HOST_FAILURES', 'EXT_INTEGRITY', 'MIGRATION_FAILED', 'EXT_MANIFEST_INVALID']);

export type QuarantineReason = z.infer<typeof quarantineReasonSchema>;

export const extensionQuarantinedSchema = z.strictObject({ name: z.string().min(1), reason: quarantineReasonSchema });

export type ExtensionQuarantined = z.infer<typeof extensionQuarantinedSchema>;

// 03 §3.9 step 8: boot finished; transient.
export const kernelStartedSchema = z.strictObject({ version: z.string().min(1), instanceId: z.uuidv4() });

export type KernelStarted = z.infer<typeof kernelStartedSchema>;

// 03 §3.8: an extension version was installed, or an extension uninstalled.
export const extensionInstalledSchema = z.strictObject({ name: z.string().min(1), digest: z.string().regex(/^[0-9a-f]{64}$/).exactOptional() });

export type ExtensionInstalled = z.infer<typeof extensionInstalledSchema>;

export const extensionUninstalledSchema = z.strictObject({ name: z.string().min(1) });

export type ExtensionUninstalled = z.infer<typeof extensionUninstalledSchema>;

// 03 §3.8: every write to a workspace's applied preset.
export const presetChangedSchema = z.strictObject({
  workspaceId: workspaceIdSchema,
  revision: z.number().int().positive(),
  cause: z.enum(['apply', 'update', 'enable', 'disable']),
});

export type PresetChanged = z.infer<typeof presetChangedSchema>;

import { z } from 'zod';
import { capabilitiesSchema } from './extension/capabilities.ts';
import { packageNameSchema } from './extension/grammar.ts';
import { snapshotDigestSchema } from './extension-lifecycle.ts';
import { workspaceIdSchema } from './identifiers.ts';

// 06 §6.6–§6.7, 03 §3.6, ADR 0145: reload (also upgrade and retry), rollback, and unquarantine.

export const extensionReloadRequestSchema = z.strictObject({
  name: packageNameSchema,
  digest: snapshotDigestSchema.exactOptional(),
  grants: z.record(workspaceIdSchema, capabilitiesSchema).exactOptional(),
});
export type ExtensionReloadRequest = z.infer<typeof extensionReloadRequestSchema>;

export const extensionRollbackRequestSchema = z.strictObject({ name: packageNameSchema, digest: snapshotDigestSchema });
export type ExtensionRollbackRequest = z.infer<typeof extensionRollbackRequestSchema>;

export const extensionReloadResultSchema = z.strictObject({ digest: snapshotDigestSchema });
export type ExtensionReloadResult = z.infer<typeof extensionReloadResultSchema>;

export const extensionUnquarantineRequestSchema = z.strictObject({ name: packageNameSchema });
export type ExtensionUnquarantineRequest = z.infer<typeof extensionUnquarantineRequestSchema>;

export const extensionUnquarantineResultSchema = z.strictObject({});
export type ExtensionUnquarantineResult = z.infer<typeof extensionUnquarantineResultSchema>;

export const extensionReloadedSchema = z.strictObject({ workspaceId: workspaceIdSchema, name: packageNameSchema, digest: snapshotDigestSchema });
export type ExtensionReloaded = z.infer<typeof extensionReloadedSchema>;

// `missing` uses enable's capability labels; `isolation` appears only when the isolation is not granted.
export const grantsRequiredParamsSchema = z.strictObject({
  digest: snapshotDigestSchema,
  workspaces: z.array(z.strictObject({ workspaceId: workspaceIdSchema, missing: z.array(z.string()), isolation: z.string().exactOptional() })),
});
export type GrantsRequiredParams = z.infer<typeof grantsRequiredParamsSchema>;

// The stored data version and the target version's data version (04 §4.8, ADR 0142).
export const rollbackBlockedParamsSchema = z.strictObject({ stored: z.number().int().positive(), target: z.number().int().positive() });
export type RollbackBlockedParams = z.infer<typeof rollbackBlockedParamsSchema>;

// `extensions.migrating` as stored (04 §4.8): the digest whose code runs the migration and a reload's confirmed grants.
export const migratingRecordSchema = z.strictObject({
  digest: snapshotDigestSchema,
  grants: z.record(workspaceIdSchema, capabilitiesSchema).exactOptional(),
});
export type MigratingRecord = z.infer<typeof migratingRecordSchema>;

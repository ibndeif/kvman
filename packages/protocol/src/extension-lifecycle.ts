import { z } from 'zod';
import { capabilitiesSchema, isolationSchema } from './extension/capabilities.ts';
import { descriptionSchema, iconNameSchema, namespaceSchema, packageNameSchema, semverSchema } from './extension/grammar.ts';
import { manifestSchema } from './extension/manifest.ts';
import { sourceSchema } from './extension/source.ts';
import { epochMsSchema, workspaceIdSchema } from './identifiers.ts';
import { textSchema } from './text.ts';
import { quarantineReasonSchema } from './kernel-events.ts';

// The payloads and results of the extension lifecycle's kernel types (03 §3.8, 06 §6.2, §6.8, ADRs 0118–0120).

export const snapshotDigestSchema = z.string().regex(/^[0-9a-f]{64}$/, 'expected a snapshot digest (64 lowercase hex characters)');

export const stageRequestSchema = z.strictObject({ source: sourceSchema });
export type StageRequest = z.infer<typeof stageRequestSchema>;

export const installRequestSchema = z.strictObject({ confirmationToken: z.string().min(1) });
export type InstallRequest = z.infer<typeof installRequestSchema>;

export const installResultSchema = z.strictObject({ name: packageNameSchema, digest: snapshotDigestSchema });
export type InstallResult = z.infer<typeof installResultSchema>;

export const uninstallRequestSchema = z.strictObject({
  name: packageNameSchema,
  deleteData: z.boolean().exactOptional(),
  keepSnapshots: z.boolean().exactOptional(),
});
export type UninstallRequest = z.infer<typeof uninstallRequestSchema>;

export const uninstallResultSchema = z.strictObject({});
export type UninstallResult = z.infer<typeof uninstallResultSchema>;

export const extensionsListRequestSchema = z.strictObject({ workspaceId: workspaceIdSchema.exactOptional() });
export type ExtensionsListRequest = z.infer<typeof extensionsListRequestSchema>;

export const extensionStatusSchema = z.enum(['active', 'quarantined', 'needs-approval']);

export const extensionListingSchema = z.strictObject({
  name: packageNameSchema,
  title: textSchema,
  icon: iconNameSchema.exactOptional(),
  description: descriptionSchema,
  version: semverSchema,
  namespace: namespaceSchema,
  activeDigest: snapshotDigestSchema,
  status: extensionStatusSchema,
  quarantineReason: quarantineReasonSchema.exactOptional(),
  isolation: z.record(workspaceIdSchema, isolationSchema),
  enabledIn: z.array(workspaceIdSchema),
});
export type ExtensionListing = z.infer<typeof extensionListingSchema>;

export const extensionsListResultSchema = z.array(extensionListingSchema);
export type ExtensionsListResult = z.infer<typeof extensionsListResultSchema>;

export const extensionGetRequestSchema = z.strictObject({ name: packageNameSchema });
export type ExtensionGetRequest = z.infer<typeof extensionGetRequestSchema>;

export const extensionGetResultSchema = z.strictObject({
  versions: z.array(z.strictObject({ digest: snapshotDigestSchema, source: sourceSchema, version: semverSchema, installedAt: epochMsSchema })),
  manifest: manifestSchema,
  grants: z.record(workspaceIdSchema, capabilitiesSchema),
});
export type ExtensionGetResult = z.infer<typeof extensionGetResultSchema>;

// 06 §6.4, ADR 0123: enable records the grants in the workspace's applied preset; both reply with its revision.
export const extensionEnableRequestSchema = z.strictObject({ workspaceId: workspaceIdSchema, name: packageNameSchema, grants: capabilitiesSchema });
export type ExtensionEnableRequest = z.infer<typeof extensionEnableRequestSchema>;

export const extensionDisableRequestSchema = z.strictObject({ workspaceId: workspaceIdSchema, name: packageNameSchema });
export type ExtensionDisableRequest = z.infer<typeof extensionDisableRequestSchema>;

export const presetRevisionResultSchema = z.strictObject({ revision: z.number().int().positive() });
export type PresetRevisionResult = z.infer<typeof presetRevisionResultSchema>;

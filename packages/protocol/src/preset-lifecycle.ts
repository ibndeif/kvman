import { z } from 'zod';
import { capabilitiesSchema, capabilityRequestSchema, isolationSchema } from './extension/capabilities.ts';
import { packageNameSchema } from './extension/grammar.ts';
import { sourceSchema } from './extension/source.ts';
import { snapshotDigestSchema } from './extension-lifecycle.ts';
import { epochMsSchema, workspaceIdSchema } from './identifiers.ts';
import { jsonObjectSchema, jsonSchema } from './json.ts';
import { presetIdSchema, presetSchema } from './preset.ts';
import { issueSchema } from './problem.ts';

// 07 §7.4, 03 §3.8, ADR 0149: the preset catalog list, get, and current queries.

export const presetsListRequestSchema = z.strictObject({});
export type PresetsListRequest = z.infer<typeof presetsListRequestSchema>;

export const presetListingSchema = z.strictObject({
  id: presetIdSchema,
  name: z.string().min(1),
  description: z.string().min(1).exactOptional(),
  icon: z.string().min(1).exactOptional(),
  builtin: z.boolean(),
  revision: z.number().int().nonnegative(),
});
export type PresetListing = z.infer<typeof presetListingSchema>;

export const presetsListResultSchema = z.array(presetListingSchema);
export type PresetsListResult = z.infer<typeof presetsListResultSchema>;

export const presetGetRequestSchema = z.strictObject({ presetId: presetIdSchema });
export type PresetGetRequest = z.infer<typeof presetGetRequestSchema>;

export const presetCurrentGetRequestSchema = z.strictObject({ workspaceId: workspaceIdSchema });
export type PresetCurrentGetRequest = z.infer<typeof presetCurrentGetRequestSchema>;

export const presetCurrentGetResultSchema = z.strictObject({ preset: presetSchema, revision: z.number().int().nonnegative() });
export type PresetCurrentGetResult = z.infer<typeof presetCurrentGetResultSchema>;

// 07 §7.4, ADR 0147: the import preview summary, request, result, and token claims.

export const hiddenSummarySchema = z.strictObject({ platform: z.array(z.string().min(1)), others: z.number().int().nonnegative() });
export type HiddenSummary = z.infer<typeof hiddenSummarySchema>;

export const presetSummarySchema = z.strictObject({
  preset: z.strictObject({
    id: presetIdSchema,
    name: z.string().min(1),
    description: z.string().min(1).exactOptional(),
    revision: z.number().int().nonnegative(),
  }),
  replaces: z.strictObject({ id: presetIdSchema, name: z.string().min(1) }).nullable(),
  extensions: z.array(z.strictObject({
    name: packageNameSchema,
    source: sourceSchema,
    enabled: z.boolean(),
    grants: capabilitiesSchema,
  })),
  pages: z.array(z.string().min(1)),
  config: z.array(packageNameSchema),
  hidden: hiddenSummarySchema,
});
export type PresetSummary = z.infer<typeof presetSummarySchema>;

export const presetImportPreviewRequestSchema = z.strictObject({ json: jsonSchema });
export type PresetImportPreviewRequest = z.infer<typeof presetImportPreviewRequestSchema>;

export const presetImportPreviewResultSchema = z.strictObject({
  summary: presetSummarySchema,
  issues: z.array(issueSchema),
  confirmationToken: z.string().min(1),
});
export type PresetImportPreviewResult = z.infer<typeof presetImportPreviewResultSchema>;

export const presetImportRequestSchema = z.strictObject({ confirmationToken: z.string().min(1) });
export type PresetImportRequest = z.infer<typeof presetImportRequestSchema>;

export const presetImportResultSchema = z.strictObject({ presetId: presetIdSchema });
export type PresetImportResult = z.infer<typeof presetImportResultSchema>;

export const presetImportTokenClaimsSchema = z.strictObject({ preset: presetSchema, expiresAt: epochMsSchema });
export type PresetImportTokenClaims = z.infer<typeof presetImportTokenClaimsSchema>;

// 07 §7.4, 03 §3.8, ADR 0148: export, apply stage, the apply preview, and apply.

export const presetExportRequestSchema = z.union([
  z.strictObject({ presetId: presetIdSchema }),
  z.strictObject({ workspaceId: workspaceIdSchema }),
]);
export type PresetExportRequest = z.infer<typeof presetExportRequestSchema>;

export const presetApplyStageRequestSchema = z.union([
  z.strictObject({ workspaceId: workspaceIdSchema, presetId: presetIdSchema }),
  z.strictObject({ workspaceId: workspaceIdSchema, json: jsonSchema }),
]);
export type PresetApplyStageRequest = z.infer<typeof presetApplyStageRequestSchema>;

export const applyNoteCodeSchema = z.enum(['dependencies-differ', 'bundled-builtin']);
export type ApplyNoteCode = z.infer<typeof applyNoteCodeSchema>;

export const applyPreviewSchema = z.strictObject({
  workspaceId: workspaceIdSchema,
  preset: z.strictObject({ id: presetIdSchema, name: z.string().min(1), revision: z.number().int().nonnegative() }),
  replaces: z.strictObject({ id: presetIdSchema, name: z.string().min(1), revision: z.number().int().nonnegative() }).nullable(),
  catalogReplaces: z.strictObject({ id: presetIdSchema, name: z.string().min(1) }).exactOptional(),
  install: z.array(z.strictObject({
    name: packageNameSchema,
    source: sourceSchema,
    version: z.string().min(1),
    digest: snapshotDigestSchema,
    isolation: isolationSchema,
    capabilities: z.array(capabilityRequestSchema),
    derived: z.strictObject({ subscribes: z.array(z.string().min(1)), providesLlm: z.array(z.string().min(1)) }),
  })),
  enable: z.array(z.strictObject({ name: packageNameSchema, version: z.string().min(1), grants: capabilitiesSchema })),
  disable: z.array(packageNameSchema),
  switches: z.array(z.strictObject({
    name: packageNameSchema,
    from: z.string().min(1),
    to: z.string().min(1),
    workspaces: z.array(z.strictObject({
      workspaceId: workspaceIdSchema,
      name: z.string().min(1),
      missing: z.array(z.string().min(1)),
      unexpected: z.array(z.string().min(1)),
    })),
  })),
  notes: z.array(z.strictObject({ code: applyNoteCodeSchema, name: packageNameSchema, params: jsonObjectSchema })),
  pages: z.strictObject({ added: z.array(z.string().min(1)), removed: z.array(z.string().min(1)) }),
  config: z.array(z.strictObject({ extension: packageNameSchema, fields: z.array(z.string().min(1)) })),
  hidden: hiddenSummarySchema,
  confirmationToken: z.string().min(1),
  expiresAt: epochMsSchema,
});
export type ApplyPreview = z.infer<typeof applyPreviewSchema>;

export const presetApplyRequestSchema = z.strictObject({ confirmationToken: z.string().min(1) });
export type PresetApplyRequest = z.infer<typeof presetApplyRequestSchema>;

// 07 §7.4, ADR 0149: edits, save-as, delete, and the catalog event.

export const presetUpdateRequestSchema = z.strictObject({
  workspaceId: workspaceIdSchema,
  patch: jsonObjectSchema,
  revision: z.number().int().min(1),
});
export type PresetUpdateRequest = z.infer<typeof presetUpdateRequestSchema>;

export const presetSaveRequestSchema = z.strictObject({
  workspaceId: workspaceIdSchema,
  name: z.string().trim().min(1).max(100),
  description: z.string().min(1).exactOptional(),
});
export type PresetSaveRequest = z.infer<typeof presetSaveRequestSchema>;

export const presetSaveResultSchema = z.strictObject({ presetId: presetIdSchema });
export type PresetSaveResult = z.infer<typeof presetSaveResultSchema>;

export const presetDeleteRequestSchema = z.strictObject({ presetId: presetIdSchema });
export type PresetDeleteRequest = z.infer<typeof presetDeleteRequestSchema>;

export const presetDeleteResultSchema = z.strictObject({});
export type PresetDeleteResult = z.infer<typeof presetDeleteResultSchema>;

export const presetCatalogChangedSchema = z.strictObject({
  presetId: presetIdSchema,
  cause: z.enum(['seed', 'import', 'save', 'delete']),
});
export type PresetCatalogChanged = z.infer<typeof presetCatalogChangedSchema>;

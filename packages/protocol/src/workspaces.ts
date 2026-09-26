import { z } from 'zod';
import { workspaceIdSchema } from './identifiers.ts';
import { trustedFileSchema, trustModeSchema } from './trust.ts';

// The payloads and results of the workspace kernel types (03 §3.8, 07 §7.1, ADRs 0122 and 0127).

// ADR 0127: a display name is trimmed and has 1–100 characters.
export const workspaceNameSchema = z.string().trim().min(1, 'a workspace name is not empty').max(100, 'a workspace name has at most 100 characters');

export const workspaceKindSchema = z.enum(['normal', 'preview']);
export type WorkspaceKind = z.infer<typeof workspaceKindSchema>;

// ADR 0127: the kernel refuses a path that is not absolute; the CLI resolves relative paths itself.
export const workspaceOpenRequestSchema = z.strictObject({ path: z.string().min(1) });
export type WorkspaceOpenRequest = z.infer<typeof workspaceOpenRequestSchema>;

export const workspaceOpenResultSchema = z.strictObject({ workspaceId: workspaceIdSchema });
export type WorkspaceOpenResult = z.infer<typeof workspaceOpenResultSchema>;

export const workspaceRenameRequestSchema = z.strictObject({ workspaceId: workspaceIdSchema, name: workspaceNameSchema });
export type WorkspaceRenameRequest = z.infer<typeof workspaceRenameRequestSchema>;

export const workspaceForgetRequestSchema = z.strictObject({ workspaceId: workspaceIdSchema });
export type WorkspaceForgetRequest = z.infer<typeof workspaceForgetRequestSchema>;

export const workspaceChangeResultSchema = z.strictObject({});
export type WorkspaceChangeResult = z.infer<typeof workspaceChangeResultSchema>;

export const workspacesListRequestSchema = z.strictObject({ includePreview: z.boolean().exactOptional() });
export type WorkspacesListRequest = z.infer<typeof workspacesListRequestSchema>;

// `exists` is false when the folder is gone (07 §7.1); `trusted` is whether a trust record is stored (ADR 0137).
export const workspaceListingSchema = z.strictObject({
  id: workspaceIdSchema,
  path: z.string().min(1),
  name: z.string().min(1),
  kind: workspaceKindSchema,
  trusted: z.boolean(),
  exists: z.boolean(),
});
export type WorkspaceListing = z.infer<typeof workspaceListingSchema>;

export const workspacesListResultSchema = z.array(workspaceListingSchema);

export const workspaceGetRequestSchema = z.strictObject({ workspaceId: workspaceIdSchema });
export type WorkspaceGetRequest = z.infer<typeof workspaceGetRequestSchema>;

export const workspaceTrustSchema = z.strictObject({ mode: trustModeSchema, files: z.array(trustedFileSchema) });
export type WorkspaceTrust = z.infer<typeof workspaceTrustSchema>;

export const workspaceGetResultSchema = z.strictObject({
  id: workspaceIdSchema,
  path: z.string().min(1),
  name: z.string().min(1),
  kind: workspaceKindSchema,
  trust: workspaceTrustSchema.nullable(),
});
export type WorkspaceGetResult = z.infer<typeof workspaceGetResultSchema>;

// kernel.workspace.opened, .renamed, and .forgotten, published without a workspace (ADR 0122).
export const workspaceEventSchema = z.strictObject({ workspaceId: workspaceIdSchema });
export type WorkspaceEvent = z.infer<typeof workspaceEventSchema>;

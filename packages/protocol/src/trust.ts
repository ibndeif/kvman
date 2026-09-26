import { z } from 'zod';
import { workspaceIdSchema } from './identifiers.ts';

// 07 §7.2, 03 §3.8, ADR 0137: the trust gate over <ws>/.kvman/.
export const trustLimits = { files: 1000, bytes: 64 * 1024 * 1024, tokenMs: 10 * 60_000 } as const;

export const trustModeSchema = z.enum(['once', 'always']);
export type TrustMode = z.infer<typeof trustModeSchema>;

export const trustedFileSchema = z.strictObject({ path: z.string().min(1), sha256: z.string().regex(/^[0-9a-f]{64}$/) });
export type TrustedFile = z.infer<typeof trustedFileSchema>;

export const trustPreviewRequestSchema = z.strictObject({ workspaceId: workspaceIdSchema });
export type TrustPreviewRequest = z.infer<typeof trustPreviewRequestSchema>;

export const trustPreviewResultSchema = z.strictObject({ files: z.array(trustedFileSchema), confirmationToken: z.string().min(1) });
export type TrustPreviewResult = z.infer<typeof trustPreviewResultSchema>;

export const trustGrantRequestSchema = z.strictObject({ confirmationToken: z.string().min(1), mode: trustModeSchema });
export type TrustGrantRequest = z.infer<typeof trustGrantRequestSchema>;

export const trustRevokeRequestSchema = z.strictObject({ workspaceId: workspaceIdSchema });
export type TrustRevokeRequest = z.infer<typeof trustRevokeRequestSchema>;

export const trustChangeResultSchema = z.strictObject({});

export const trustChangedSchema = z.strictObject({ workspaceId: workspaceIdSchema, trusted: z.boolean() });
export type TrustChanged = z.infer<typeof trustChangedSchema>;

// What a preview token carries under its HMAC (ADR 0137); the token itself is opaque to callers.
export const trustTokenClaimsSchema = z.strictObject({ workspaceId: workspaceIdSchema, digest: z.string().regex(/^[0-9a-f]{64}$/), expiresAt: z.number().int() });
export type TrustTokenClaims = z.infer<typeof trustTokenClaimsSchema>;

import { z } from 'zod';
import { portSchema } from './daemon.ts';
import { workspaceIdSchema } from './identifiers.ts';
import { jsonSchema } from './json.ts';
import { issueSchema } from './problem.ts';

// The payloads and results of the kernel's own queries (03 §3.8), added as the milestones that build them land.

export const healthRequestSchema = z.strictObject({});

export type HealthRequest = z.infer<typeof healthRequestSchema>;

// 03 §3.8, ADRs 0088, 0092: `degraded` while an extension is quarantined; `instanceId` is the lock nonce.
export const healthResultSchema = z.strictObject({
  status: z.enum(['ok', 'degraded']),
  version: z.string().min(1),
  instanceId: z.uuidv4(),
  processStart: z.string().min(1),
  uptimeMs: z.number().int().nonnegative(),
  port: portSchema,
  home: z.string().min(1),
});

export type HealthResult = z.infer<typeof healthResultSchema>;

// 12 §12.7, ADRs 0111 and 0112: the schema document of the kernel and the listed extensions, searched by `q`.
export const schemaGetRequestSchema = z.strictObject({
  workspaceId: workspaceIdSchema.exactOptional(),
  q: z.string().regex(/\S/, 'q needs at least one non-space character').exactOptional(),
});

export type SchemaGetRequest = z.infer<typeof schemaGetRequestSchema>;

// 03 §3.8, ADR 0110: exactly one thing to validate; M2.1 checks a manifest, a preset, or a page structurally.
const validationWorkspace = { workspaceId: workspaceIdSchema.exactOptional() };

export const validateRequestSchema = z.union([
  z.strictObject({ ...validationWorkspace, manifest: jsonSchema }),
  z.strictObject({ ...validationWorkspace, preset: jsonSchema }),
  z.strictObject({ ...validationWorkspace, page: jsonSchema }),
  z.strictObject({ ...validationWorkspace, catalog: jsonSchema }),
]);

export type ValidateRequest = z.infer<typeof validateRequestSchema>;

// ADR 0011: `ok` is false exactly when some issue is an error.
export const validateResultSchema = z.strictObject({ ok: z.boolean(), issues: z.array(issueSchema) });

export type ValidateResult = z.infer<typeof validateResultSchema>;

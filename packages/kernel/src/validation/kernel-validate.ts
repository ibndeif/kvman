import { pageDefSchema, presetSchema, presetSecretIssues, type Issue, type JsonObject, type ValidateRequest, type ValidateResult } from '@kvman/protocol';
import { validateManifest } from './manifest-validation.ts';
import { schedulePayloadIssues } from './schedule-payloads.ts';
import type { KernelEvents } from './reference-rules.ts';
import { schemaIssues } from './schema-issues.ts';

export type ValidateContext = { kernelEvents: KernelEvents; configSchemas: Readonly<Record<string, JsonObject>> };

// A request M2.1 cannot answer is refused with its issue; anything else is answered, valid or not (ADRs 0110,
// 0151). `catalog` validation arrives in M2.11; the workspace checks run where the query is answered, against the
// workspace the request names.
export type ValidateOutcome = { answered: true; result: ValidateResult } | { answered: false; issues: Issue[] };

function presetIssues(candidate: unknown, context: ValidateContext): Issue[] {
  const parsed = presetSchema.safeParse(candidate);
  return parsed.success ? presetSecretIssues(parsed.data, context.configSchemas) : schemaIssues(parsed.error.issues);
}

function pageIssues(candidate: unknown): Issue[] {
  const parsed = pageDefSchema.safeParse(candidate);
  return parsed.success ? [] : schemaIssues(parsed.error.issues);
}

function issuesOf(request: ValidateRequest, context: ValidateContext): Issue[] {
  if ('manifest' in request) return [...validateManifest(request.manifest, context), ...schedulePayloadIssues(request.manifest)];
  if ('preset' in request) return presetIssues(request.preset, context);
  if ('page' in request) return pageIssues(request.page);
  return [];
}

// 03 §3.8, 06 §6.3: structural checks; `ok` is false exactly when some issue is an error (ADR 0011).
export function validateRequest(request: ValidateRequest, context: ValidateContext): ValidateOutcome {
  if ('catalog' in request) {
    return { answered: false, issues: [{ path: 'catalog', message: 'catalog validation is not available yet', hint: 'validate a manifest, preset, or page' }] };
  }
  const issues = issuesOf(request, context);
  return { answered: true, result: { ok: issues.every((issue) => issue.severity === 'warning'), issues } };
}

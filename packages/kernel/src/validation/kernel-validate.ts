import { pageDefSchema, presetSchema, presetSecretIssues, type Issue, type JsonObject, type ValidateRequest, type ValidateResult } from '@kvman/protocol';
import { presetTextIssues } from '../i18n/owner-text.ts';
import { catalogValidationIssues } from '../i18n/text-rules.ts';
import type { ValueChecker } from '../ui/value-checks.ts';
import { validateManifest } from './manifest-validation.ts';
import { schedulePayloadIssues } from './schedule-payloads.ts';
import type { KernelEvents } from './reference-rules.ts';
import { schemaIssues } from './schema-issues.ts';

export type ValidateContext = { kernelEvents: KernelEvents; configSchemas: Readonly<Record<string, JsonObject>>; values: ValueChecker };

function presetIssues(candidate: unknown, context: ValidateContext): Issue[] {
  const parsed = presetSchema.safeParse(candidate);
  return parsed.success ? [...presetSecretIssues(parsed.data, context.configSchemas), ...presetTextIssues(parsed.data)] : schemaIssues(parsed.error.issues);
}

function pageIssues(candidate: unknown): Issue[] {
  const parsed = pageDefSchema.safeParse(candidate);
  return parsed.success ? [] : schemaIssues(parsed.error.issues);
}

function issuesOf(request: ValidateRequest, context: ValidateContext): Issue[] {
  if ('manifest' in request) return [...validateManifest(request.manifest, context), ...schedulePayloadIssues(request.manifest)];
  if ('preset' in request) return presetIssues(request.preset, context);
  if ('page' in request) return pageIssues(request.page);
  return catalogValidationIssues(request.catalog);
}

// 03 §3.8, 06 §6.3: structural checks; `ok` is false exactly when some issue is an error (ADR 0011). Every request
// is answered, valid or not (ADRs 0110, 0151, 0160); the workspace checks run where the query is answered.
export function validateRequest(request: ValidateRequest, context: ValidateContext): ValidateResult {
  const issues = issuesOf(request, context);
  return { ok: issues.every((issue) => issue.severity === 'warning'), issues };
}

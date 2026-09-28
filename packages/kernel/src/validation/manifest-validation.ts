import { canonicalJson, manifestSchema, type Issue, type Json } from '@kvman/protocol';
import { literalIssues } from '../i18n/literal-rules.ts';
import { manifestTextIssues } from '../i18n/owner-text.ts';
import { manifestUiIssues } from '../ui/ui-checks.ts';
import type { ValueChecker } from '../ui/value-checks.ts';
import { configIssues, settingsSectionIssues } from './config-rules.ts';
import { objectOf } from './json-reading.ts';
import { manifestNames } from './manifest-names.ts';
import { nameIssues } from './name-rules.ts';
import { requiredTypeIssues, subscriptionLaneIssues, type KernelEvents } from './reference-rules.ts';
import { scheduleIssues } from './schedule-rules.ts';
import { schemaIssues } from './schema-issues.ts';
import { typeIssues } from './type-rules.ts';

// `values` checks literal values in views; the install loader has none (ADR 0157).
export type ManifestContext = { kernelEvents: KernelEvents; values?: ValueChecker };

export const maxManifestBytes = 5 * 1024 * 1024;

function sizeIssues(candidate: Json): Issue[] {
  const bytes = Buffer.byteLength(canonicalJson(candidate), 'utf8');
  if (bytes <= maxManifestBytes) return [];
  return [{ path: '', message: `the manifest is ${bytes} bytes of canonical JSON; the limit is 5 MB`, hint: 'keep the manifest under 5 MB: shorten examples, views, and catalogs' }];
}

// Every structural rule of 06 §6.3 that reads a manifest, each mistake reported once (ADR 0042): a rule's issue,
// which carries a hint, replaces the schema's issue at the same path, and so does an issue the recording already
// reported there. The UI and text rules read the typed manifest, so they run once it matches its schema (ADRs 0157,
// 0160).
export function validateManifest(candidate: Json, context: ManifestContext, recorded: readonly Issue[] = []): Issue[] {
  const manifest = objectOf(candidate);
  const rules = manifest === undefined ? [] : [
    ...nameIssues(manifest, manifestNames(manifest)),
    ...typeIssues(manifest),
    ...subscriptionLaneIssues(manifest, context.kernelEvents),
    ...requiredTypeIssues(manifest),
    ...configIssues(manifest),
    ...settingsSectionIssues(manifest),
    ...scheduleIssues(manifest),
  ];
  const known = [...recorded, ...rules];
  const reported = new Set(known.filter((issue) => issue.severity !== 'warning').map((issue) => issue.path));
  const parsed = manifestSchema.safeParse(candidate);
  const fromSchema = parsed.success ? [] : schemaIssues(parsed.error.issues).filter((issue) => !reported.has(issue.path));
  const typed = manifest === undefined || !parsed.success ? [] : [
    ...manifestUiIssues(parsed.data, context.values),
    ...manifestTextIssues(manifest, parsed.data),
    ...literalIssues(manifest, parsed.data),
  ];
  return [...known, ...sizeIssues(candidate), ...fromSchema, ...typed];
}

import { canonicalJson, manifestSchema, type Issue, type Json } from '@kvman/protocol';
import { configIssues } from './config-rules.ts';
import { objectOf } from './json-reading.ts';
import { manifestNames } from './manifest-names.ts';
import { nameIssues } from './name-rules.ts';
import { requiredTypeIssues, subscriptionLaneIssues, type KernelEvents } from './reference-rules.ts';
import { scheduleIssues } from './schedule-rules.ts';
import { schemaIssues } from './schema-issues.ts';
import { typeIssues } from './type-rules.ts';

export type ManifestContext = { kernelEvents: KernelEvents };

export const maxManifestBytes = 5 * 1024 * 1024;

function sizeIssues(candidate: Json): Issue[] {
  const bytes = Buffer.byteLength(canonicalJson(candidate), 'utf8');
  if (bytes <= maxManifestBytes) return [];
  return [{ path: '', message: `the manifest is ${bytes} bytes of canonical JSON; the limit is 5 MB`, hint: 'keep the manifest under 5 MB: shorten examples, views, and catalogs' }];
}

// Every structural rule of 06 §6.3 that reads a manifest (not its UI, M2.10), each mistake reported once (ADR 0042):
// a rule's issue, which carries a hint, replaces the schema's issue at the same path, and so does an issue the
// recording already reported there.
export function validateManifest(candidate: Json, context: ManifestContext, recorded: readonly Issue[] = []): Issue[] {
  const manifest = objectOf(candidate);
  const rules = manifest === undefined ? [] : [
    ...nameIssues(manifest, manifestNames(manifest)),
    ...typeIssues(manifest),
    ...subscriptionLaneIssues(manifest, context.kernelEvents),
    ...requiredTypeIssues(manifest),
    ...configIssues(manifest),
    ...scheduleIssues(manifest),
  ];
  const known = [...recorded, ...rules];
  const reported = new Set(known.filter((issue) => issue.severity !== 'warning').map((issue) => issue.path));
  const parsed = manifestSchema.safeParse(candidate);
  const fromSchema = parsed.success ? [] : schemaIssues(parsed.error.issues).filter((issue) => !reported.has(issue.path));
  return [...known, ...sizeIssues(candidate), ...fromSchema];
}

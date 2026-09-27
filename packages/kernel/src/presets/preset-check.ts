import { presetSchema, presetSecretIssues, type Issue, type JsonObject, type Preset } from '@kvman/protocol';
import { schemaIssues } from '../validation/schema-issues.ts';

// 07 §7.4, ADR 0147: the import check shared by import preview, apply stage with json, and save-as.
export function checkShareablePreset(
  candidate: unknown,
  configSchemas: Readonly<Record<string, JsonObject>>,
): { ok: true; preset: Preset } | { ok: false; code: 'PRESET_INVALID' | 'PRESET_UNSHAREABLE' | 'PRESET_SECRET'; issues: Issue[] } {
  const parsed = presetSchema.safeParse(candidate);
  if (!parsed.success) {
    const issues = schemaIssues(parsed.error.issues);
    const invalid = issues.filter((issue) => !isSourceIssue(issue.path));
    return invalid.length > 0 ? { ok: false, code: 'PRESET_INVALID', issues } : { ok: false, code: 'PRESET_UNSHAREABLE', issues };
  }
  const preset = parsed.data;
  const unshareable: Issue[] = [];
  for (const [name, entry] of Object.entries(preset.extensions)) {
    if (entry.source.startsWith('dev:') || entry.source.startsWith('local:')) {
      unshareable.push({ path: `extensions.${name}.source`, message: 'dev: and local: sources cannot be shared' });
    }
    if (entry.digest !== undefined) {
      unshareable.push({ path: `extensions.${name}.digest`, message: 'local digests are never shared' });
    }
  }
  if (unshareable.length > 0) return { ok: false, code: 'PRESET_UNSHAREABLE', issues: unshareable };
  const secrets = presetSecretIssues(preset, configSchemas);
  if (secrets.length > 0) return { ok: false, code: 'PRESET_SECRET', issues: secrets };
  return { ok: true, preset };
}

// An issue at extensions.<name>.source, exactly three segments with source last.
function isSourceIssue(path: string): boolean {
  const segments = path.split('.');
  return segments.length === 3 && segments[0] === 'extensions' && segments[2] === 'source';
}

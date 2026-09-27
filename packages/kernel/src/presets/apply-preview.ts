import { canonicalJson, jsonObjectSchema, type ApplyPreview, type Json, type JsonObject, type Preset } from '@kvman/protocol';
import { derivedCapabilities, sameGrants } from '../registry/grant-validity.ts';
import type { Connection } from '../storage/driver.ts';
import { readConfigRow } from '../storage/config-rows.ts';
import { hiddenSummary } from './preset-summary.ts';
import type { PlannedExtension } from './apply-grants.ts';
import type { SwitchPlan } from './apply-checks.ts';

export type ApplyPreviewBody = Omit<ApplyPreview, 'confirmationToken' | 'expiresAt'>;

export type PreviewInput = {
  workspaceId: string;
  preset: Preset;
  applied: { preset: Preset; revision: number } | undefined;
  planned: readonly PlannedExtension[];
  switches: readonly SwitchPlan[];
  catalogReplaces: { id: string; name: string } | undefined;
  kvmanVersion: string;
  connection: Connection;
};

function pageIds(preset: Preset): string[] {
  return (preset.pages ?? []).map((page) => `preset.${page.name}`);
}

// ADR 0148: the versions stage fetched, with what the grant dialog shows for them.
function installOf(input: PreviewInput): ApplyPreviewBody['install'] {
  return input.planned
    .filter(({ version }) => version.staged !== undefined)
    .map(({ name, version, grants }) => ({
      name,
      source: version.source,
      version: version.manifest.meta.version,
      digest: version.digest,
      isolation: grants.isolation,
      capabilities: version.manifest.permissions.capabilities,
      derived: derivedCapabilities(version.manifest).derived,
    }));
}

// The enabled entries whose state or grant differs from the applied copy.
function enableOf(input: PreviewInput): ApplyPreviewBody['enable'] {
  return input.planned
    .filter(({ name, version, grants }) => {
      if (!version.entry.enabled) return false;
      const current = input.applied?.preset.extensions[name];
      return current?.enabled !== true || !sameGrants(current.grants, grants);
    })
    .map(({ name, version, grants }) => ({ name, version: version.manifest.meta.version, grants }));
}

function disableOf(input: PreviewInput): string[] {
  return Object.entries(input.applied?.preset.extensions ?? {})
    .filter(([, entry]) => entry.enabled)
    .map(([name]) => name)
    .filter((name) => input.preset.extensions[name]?.enabled !== true)
    .sort();
}

function notesOf(input: PreviewInput): ApplyPreviewBody['notes'] {
  return input.planned.flatMap(({ name, version }): ApplyPreviewBody['notes'] => {
    if (version.staged !== undefined && (version.source.startsWith('npm:') || version.source.startsWith('git:'))) {
      return [{ code: 'dependencies-differ' as const, name, params: jsonObjectSchema.parse({}) }];
    }
    const integrity = version.entry.integrity;
    if (version.builtin && integrity !== undefined && integrity !== `builtin:${input.kvmanVersion}`) {
      return [{ code: 'bundled-builtin' as const, name, params: { kvmanVersion: integrity.slice('builtin:'.length), version: version.manifest.meta.version } }];
    }
    return [];
  });
}

function pagesOf(input: PreviewInput): ApplyPreviewBody['pages'] {
  const next = new Set(pageIds(input.preset));
  const current = new Set(input.applied === undefined ? [] : pageIds(input.applied.preset));
  return { added: [...next].filter((id) => !current.has(id)), removed: [...current].filter((id) => !next.has(id)) };
}

function changedFields(presetValue: unknown, currentValue: unknown): string[] {
  const next = jsonObjectSchema.safeParse(presetValue);
  if (!next.success) return [];
  const parsed = jsonObjectSchema.safeParse(currentValue);
  const current: JsonObject = parsed.success ? parsed.data : {};
  return Object.keys(next.data)
    .filter((field) => {
      const left: Json | undefined = next.data[field];
      if (left === undefined) return false;
      const right: Json | undefined = current[field];
      return right === undefined || canonicalJson(left) !== canonicalJson(right);
    })
    .sort();
}

// For every extension the preset's config names, the top-level fields its row changes; unchanged rows are left out.
function configOf(input: PreviewInput): ApplyPreviewBody['config'] {
  const config = input.preset.config ?? {};
  return Object.keys(config)
    .sort()
    .flatMap((extension) => {
      const fields = changedFields(config[extension], readConfigRow(input.connection, extension, input.workspaceId).value);
      return fields.length === 0 ? [] : [{ extension, fields }];
    });
}

// ADR 0148: exactly the protocol's apply preview, without the confirmation token.
export function buildPreview(input: PreviewInput): ApplyPreviewBody {
  const { preset, applied } = input;
  return {
    workspaceId: input.workspaceId,
    preset: { id: preset.id, name: preset.name, revision: preset.revision },
    replaces: applied === undefined ? null : { id: applied.preset.id, name: applied.preset.name, revision: applied.revision },
    ...(input.catalogReplaces === undefined ? {} : { catalogReplaces: input.catalogReplaces }),
    install: installOf(input),
    enable: enableOf(input),
    disable: disableOf(input),
    switches: input.switches.map(({ name, from, to, workspaces }) => ({ name, from, to, workspaces })),
    notes: notesOf(input),
    pages: pagesOf(input),
    config: configOf(input),
    hidden: hiddenSummary(preset.hidden),
  };
}

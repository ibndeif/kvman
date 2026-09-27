import {
  jsonSchema, presetCurrentGetRequestSchema, presetExportRequestSchema, presetGetRequestSchema, presetImportPreviewRequestSchema, presetsListRequestSchema,
  type Json, type Preset,
} from '@kvman/protocol';
import { presetWithConfig, withoutDigests } from '../presets/applied-config.ts';
import { checkShareablePreset } from '../presets/preset-check.ts';
import { presetSummary } from '../presets/preset-summary.ts';
import type { PresetImportTokens } from '../presets/import-tokens.ts';
import type { KernelRegistry } from '../registry/kernel-registry.ts';
import { listCatalog, readCatalogPreset } from '../storage/catalog-rows.ts';
import { readAppliedPreset } from '../storage/preset-changes.ts';
import type { Connection } from '../storage/driver.ts';
import type { ExtensionQueryAnswer } from './extension-queries.ts';
import { readWorkspace } from './workspace-rows.ts';

export type PresetQueriesDeps = {
  connection: Connection;
  registry: () => KernelRegistry;
  tokens: PresetImportTokens;
};

// 03 §3.8, 07 §7.4, ADRs 0147 and 0149: the preset catalog queries and the import preview.
export class PresetQueries {
  readonly #connection: Connection;
  readonly #registry: () => KernelRegistry;
  readonly #tokens: PresetImportTokens;

  constructor(deps: PresetQueriesDeps) {
    this.#connection = deps.connection;
    this.#registry = deps.registry;
    this.#tokens = deps.tokens;
  }

  list(payload: unknown): ExtensionQueryAnswer<Json> {
    presetsListRequestSchema.parse(payload);
    return { ok: true, value: jsonSchema.parse(listCatalog(this.#connection)) };
  }

  get(payload: unknown): ExtensionQueryAnswer<Json> {
    const { presetId } = presetGetRequestSchema.parse(payload);
    const found = readCatalogPreset(this.#connection, presetId);
    if (found === undefined) return { ok: false, code: 'NOT_FOUND', detail: `no preset ${presetId} exists` };
    return { ok: true, value: jsonSchema.parse(found.preset) };
  }

  current(payload: unknown): ExtensionQueryAnswer<Json> {
    const { workspaceId } = presetCurrentGetRequestSchema.parse(payload);
    if (readWorkspace(this.#connection, workspaceId) === undefined) {
      return { ok: false, code: 'WORKSPACE_INVALID', detail: `no workspace ${workspaceId} exists` };
    }
    const applied = readAppliedPreset({ connection: this.#connection }, workspaceId);
    if (applied === undefined) {
      return { ok: false, code: 'PRESET_REQUIRED', detail: `workspace ${workspaceId} has no applied preset` };
    }
    return { ok: true, value: jsonSchema.parse({ preset: presetWithConfig(this.#connection, workspaceId, applied.preset), revision: applied.revision }) };
  }

  importPreview(payload: unknown): ExtensionQueryAnswer<Json> {
    const { json } = presetImportPreviewRequestSchema.parse(payload);
    const checked = checkShareablePreset(json, this.#registry().configSchemas());
    if (!checked.ok) {
      return { ok: false, code: checked.code, detail: checked.issues[0]?.message ?? checked.code, issues: checked.issues };
    }
    const preset = checked.preset;
    const existing = readCatalogPreset(this.#connection, preset.id);
    if (existing?.builtin === true) return { ok: false, code: 'PRESET_READONLY', detail: `preset ${preset.id} is built-in` };
    const replaces = existing === undefined ? null : { id: existing.preset.id, name: existing.preset.name };
    return {
      ok: true,
      value: jsonSchema.parse({ summary: presetSummary(preset, replaces), issues: [], confirmationToken: this.#tokens.issue(preset) }),
    };
  }

  // ADR 0149: a catalog preset, or a workspace's applied copy with its config rows, as shareable JSON.
  export(payload: unknown): ExtensionQueryAnswer<Json> {
    const request = presetExportRequestSchema.parse(payload);
    if ('presetId' in request) {
      const found = readCatalogPreset(this.#connection, request.presetId);
      if (found === undefined) return { ok: false, code: 'NOT_FOUND', detail: `no preset ${request.presetId} exists` };
      return this.#shareable(withoutDigests(found.preset));
    }
    if (readWorkspace(this.#connection, request.workspaceId) === undefined) {
      return { ok: false, code: 'WORKSPACE_INVALID', detail: `no workspace ${request.workspaceId} exists` };
    }
    const applied = readAppliedPreset({ connection: this.#connection }, request.workspaceId);
    if (applied === undefined) {
      return { ok: false, code: 'PRESET_REQUIRED', detail: `workspace ${request.workspaceId} has no applied preset` };
    }
    return this.#shareable(withoutDigests(presetWithConfig(this.#connection, request.workspaceId, applied.preset)));
  }

  #shareable(preset: Preset): ExtensionQueryAnswer<Json> {
    const checked = checkShareablePreset(preset, this.#registry().configSchemas());
    if (!checked.ok) {
      return { ok: false, code: checked.code, detail: checked.issues[0]?.message ?? checked.code, issues: checked.issues };
    }
    return { ok: true, value: jsonSchema.parse(checked.preset) };
  }
}

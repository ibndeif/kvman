import {
  jsonSchema, llmDefaultsSchema, type Json, type LlmDefaults, type LlmResult, type ModelRef, type PresetChanged,
} from '@kvman/protocol';
import { globalDefaultsKey } from '../llm/llm-defaults.ts';
import { replaceProviderModels, type StoredModel } from '../llm/model-rows.ts';
import { kernelProblem } from '../problems.ts';
import { readAppliedPreset } from './preset-changes.ts';
import { publishKernelEvent, UnitRejected, type UnitScope } from './unit-contents.ts';

// 03 §3.12: the unit that completes kernel.llm.complete writes its usage row, and its reply is the provider's result.
export type LlmChange =
  | { kind: 'llm.usage'; messageId: string; workspaceId: string | undefined; caller: string; result: LlmResult; costUsd: number | null }
  | { kind: 'llm.models'; provider: string; models: StoredModel[] }
  | { kind: 'llm.defaults'; workspaceId: string | undefined; purpose: keyof LlmDefaults; model: ModelRef | null };

function applyUsage(scope: UnitScope, change: Extract<LlmChange, { kind: 'llm.usage' }>): Json {
  const { result } = change;
  scope.connection
    .prepare(`INSERT INTO llm_usage (message_id, ws, caller, provider, model, input, output, cache_read, cache_write, cost_usd, correlation_id, at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      change.messageId, change.workspaceId ?? '', change.caller, result.model.provider, result.model.id, result.usage.input, result.usage.output,
      result.usage.cacheRead ?? 0, result.usage.cacheWrite ?? 0, change.costUsd, scope.correlationId, scope.now,
    );
  return jsonSchema.parse(result);
}

// ADR 0152: a refresh rewrites one provider's rows and announces it without a workspace.
function applyModels(scope: UnitScope, change: Extract<LlmChange, { kind: 'llm.models' }>): Json {
  replaceProviderModels(scope.connection, change.provider, change.models, scope.now);
  publishKernelEvent(scope, undefined, { type: 'kernel.llm.models.changed', payload: { provider: change.provider } });
  return {};
}

// ADR 0152: a workspace default is a preset write with cause update; a global default writes the kernel_settings row.
function applyDefaults(scope: UnitScope, change: Extract<LlmChange, { kind: 'llm.defaults' }>): Json {
  if (change.workspaceId !== undefined) {
    const applied = readAppliedPreset(scope, change.workspaceId);
    if (applied === undefined) {
      throw new UnitRejected(kernelProblem('PRESET_REQUIRED', { correlationId: scope.correlationId, detail: `workspace ${change.workspaceId} has no applied preset`, hint: 'choose a preset for the workspace first' }));
    }
    const defaults = { ...(applied.preset.llm?.defaults ?? {}) };
    if (change.model === null) delete defaults[change.purpose];
    else defaults[change.purpose] = change.model;
    const llm = Object.keys(defaults).length === 0 ? undefined : { defaults };
    const preset = { ...applied.preset, ...(llm === undefined ? {} : { llm }) };
    if (llm === undefined) delete preset.llm;
    const revision = applied.revision + 1;
    scope.connection.prepare('UPDATE workspace_presets SET preset = ?, revision = ? WHERE workspace_id = ?')
      .run(JSON.stringify({ ...preset, revision }), revision, change.workspaceId);
    const changed: PresetChanged = { workspaceId: change.workspaceId, revision, cause: 'update' };
    publishKernelEvent(scope, change.workspaceId, { type: 'kernel.preset.changed', payload: changed });
    publishKernelEvent(scope, change.workspaceId, { type: 'kernel.llm.defaults.changed', payload: { workspaceId: change.workspaceId } });
    return {};
  }
  const row = scope.connection.prepare('SELECT revision FROM kernel_settings WHERE key = ?').get(globalDefaultsKey);
  const current = row === undefined ? {} : llmDefaultsSchema.parse(JSON.parse(String(row['value'])));
  const defaults = { ...current };
  if (change.model === null) delete defaults[change.purpose];
  else defaults[change.purpose] = change.model;
  const revision = (row === undefined ? 0 : Number(row['revision'])) + 1;
  scope.connection
    .prepare(`INSERT INTO kernel_settings (key, value, revision, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, revision = excluded.revision, updated_at = excluded.updated_at`)
    .run(globalDefaultsKey, JSON.stringify(llmDefaultsSchema.parse(defaults)), revision, scope.now);
  publishKernelEvent(scope, undefined, { type: 'kernel.llm.defaults.changed', payload: {} });
  return {};
}

export function applyLlmChange(scope: UnitScope, change: LlmChange): Json {
  if (change.kind === 'llm.usage') return applyUsage(scope, change);
  if (change.kind === 'llm.models') return applyModels(scope, change);
  return applyDefaults(scope, change);
}

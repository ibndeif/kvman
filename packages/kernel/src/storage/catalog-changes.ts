import { type Json, type Preset, type PresetCatalogChanged } from '@kvman/protocol';
import { kernelProblem } from '../problems.ts';
import { readCatalogPreset, writeCatalogPreset } from './catalog-rows.ts';
import { publishKernelEvent, UnitRejected, type UnitScope } from './unit-contents.ts';

// 07 §7.4: every write to the preset catalog.
export type CatalogChange =
  | { kind: 'catalog.write'; preset: Preset; builtin: boolean; cause: 'seed' | 'import' | 'save' }
  | { kind: 'catalog.delete'; presetId: string; cause: 'seed' | 'delete' };

function write(scope: UnitScope, change: Extract<CatalogChange, { kind: 'catalog.write' }>): Json {
  const existing = readCatalogPreset(scope.connection, change.preset.id);
  if ((change.cause === 'import' || change.cause === 'save') && existing?.builtin === true) {
    throw new UnitRejected(kernelProblem('PRESET_READONLY', { correlationId: scope.correlationId, detail: `preset ${change.preset.id} is built-in` }));
  }
  writeCatalogPreset(scope.connection, change.preset, change.builtin, scope.now);
  const payload: PresetCatalogChanged = { presetId: change.preset.id, cause: change.cause };
  publishKernelEvent(scope, undefined, { type: 'kernel.preset.catalog.changed', payload });
  return { presetId: change.preset.id };
}

function remove(scope: UnitScope, change: Extract<CatalogChange, { kind: 'catalog.delete' }>): Json {
  const existing = readCatalogPreset(scope.connection, change.presetId);
  if (existing === undefined) {
    throw new UnitRejected(kernelProblem('NOT_FOUND', { correlationId: scope.correlationId, detail: `no preset ${change.presetId} exists` }));
  }
  if (change.cause === 'delete' && existing.builtin) {
    throw new UnitRejected(kernelProblem('PRESET_READONLY', { correlationId: scope.correlationId, detail: `preset ${change.presetId} is built-in` }));
  }
  scope.connection.prepare('DELETE FROM presets WHERE id = ?').run(change.presetId);
  const payload: PresetCatalogChanged = { presetId: change.presetId, cause: change.cause };
  publishKernelEvent(scope, undefined, { type: 'kernel.preset.catalog.changed', payload });
  return {};
}

// 07 §7.4: a catalog write with its event, in the unit that caused it.
export function applyCatalogChange(scope: UnitScope, change: CatalogChange): Json {
  return change.kind === 'catalog.write' ? write(scope, change) : remove(scope, change);
}

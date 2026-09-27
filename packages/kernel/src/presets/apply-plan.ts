import type { Preset, Problem } from '@kvman/protocol';
import type { RegistryState } from '../registry/registry-state.ts';
import type { Connection } from '../storage/driver.ts';
import { readCatalogPreset } from '../storage/catalog-rows.ts';
import { checkEnabledSet, checkedGrants, checkRollback, planSwitches, type SwitchPlan } from './apply-checks.ts';
import type { PlannedExtension } from './apply-grants.ts';
import { buildPreview, type ApplyPreviewBody } from './apply-preview.ts';
import type { ResolvedVersion } from './version-resolution.ts';

export type PlanApplyInput = {
  workspaceId: string;
  preset: Preset;
  versions: readonly ResolvedVersion[];
  applied: { preset: Preset; revision: number } | undefined;
  registry: RegistryState;
  connection: Connection;
  correlationId: string;
  kvmanVersion: string;
  importing: boolean;
};

export type ApplyPlan = {
  extensions: PlannedExtension[];
  switches: SwitchPlan[];
  preview: ApplyPreviewBody;
  importing: boolean;
};

// ADR 0148: every check of apply, in order, against what the preset would give; the first that fails is the answer,
// so no token is issued for a preset that cannot apply.
export function planApply(input: PlanApplyInput): { ok: true; plan: ApplyPlan } | { ok: false; problem: Problem } {
  const { workspaceId, preset, versions, applied, registry, connection, correlationId, kvmanVersion, importing } = input;
  const granted = checkedGrants(versions, correlationId);
  if (!granted.ok) return granted;
  const { planned } = granted;
  const rollback = checkRollback(planned, connection, registry, correlationId);
  if (rollback !== undefined) return { ok: false, problem: rollback };
  const switched = planSwitches(planned, { workspaceId, registry, connection, correlationId });
  if (!switched.ok) return switched;
  const enabled = checkEnabledSet(planned, { preset, registry: registry.current(), connection, workspaceId, correlationId });
  if (enabled !== undefined) return { ok: false, problem: enabled };
  const catalog = importing ? readCatalogPreset(connection, preset.id) : undefined;
  const preview = buildPreview({
    workspaceId, preset, applied, planned, switches: switched.switches, kvmanVersion, connection,
    catalogReplaces: catalog === undefined ? undefined : { id: catalog.preset.id, name: catalog.preset.name },
  });
  return { ok: true, plan: { extensions: planned, switches: switched.switches, preview, importing } };
}

import type { ConfigWriteScope, Json, JsonObject } from '@kvman/protocol';
import { writeConfig } from './config-rows.ts';
import type { UnitScope } from './unit-contents.ts';

// kernel.config.set, kernel.secret.set, and kernel.secret.clear (07 §7.5, ADRs 0125, 0126); the secrets reach the
// file after the commit.
export type SettingChange =
  | { kind: 'config.set'; extension: string; scope: ConfigWriteScope; workspaceId?: string; value: JsonObject; revision: number }
  | { kind: 'secret.set'; extension: string; name: string; value: string }
  | { kind: 'secret.clear'; extension: string; name: string };

export function applySettingChange(scope: UnitScope, change: SettingChange): Json {
  if (change.kind === 'config.set') {
    const revision = writeConfig(scope, {
      extension: change.extension, scope: change.scope, workspaceId: change.workspaceId, value: change.value, expectedRevision: change.revision,
    });
    return { revision };
  }
  if (change.kind === 'secret.set') scope.applied.secrets.push({ kind: 'set', extension: change.extension, name: change.name, value: change.value });
  else scope.applied.secrets.push({ kind: 'clear', extension: change.extension, name: change.name });
  return {};
}

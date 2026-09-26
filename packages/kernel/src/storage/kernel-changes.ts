import type { Json } from '@kvman/protocol';
import { applyExtensionChange, type ExtensionChange } from './extension-changes.ts';
import { applyPresetChange, type PresetChange } from './preset-changes.ts';
import { applySettingChange, type SettingChange } from './setting-changes.ts';
import { applyTrustChange, type TrustChange } from './trust-changes.ts';
import type { UnitScope } from './unit-contents.ts';
import { applyWorkspaceChange, type WorkspaceChange } from './workspace-changes.ts';

// The kernel's own writes, each applied in one unit with its events and its command's reply.
export type KernelChange = ExtensionChange | WorkspaceChange | PresetChange | SettingChange | TrustChange;

export function applyKernelChange(scope: UnitScope, change: KernelChange): Json {
  switch (change.kind) {
    case 'install':
    case 'uninstall':
      return applyExtensionChange(scope, change);
    case 'workspace.open':
    case 'workspace.rename':
    case 'workspace.forget':
    case 'workspace.cancel':
      return applyWorkspaceChange(scope, change);
    case 'extension.enable':
    case 'extension.disable':
      return applyPresetChange(scope, change);
    case 'config.set':
    case 'secret.set':
    case 'secret.clear':
      return applySettingChange(scope, change);
    case 'trust.grant':
    case 'trust.revoke':
    case 'trust.close':
    case 'trust.clear-once':
      return applyTrustChange(scope, change);
  }
}

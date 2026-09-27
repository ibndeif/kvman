import {
  extensionReloadedSchema, extensionReloadRequestSchema, extensionReloadResultSchema, extensionRollbackRequestSchema, extensionUnquarantineRequestSchema,
  extensionUnquarantineResultSchema, type TypeEntry,
} from '@kvman/protocol';
import { command, event } from './kernel-workspace-types.ts';

// 03 §3.8, 06 §6.6–§6.7, 03 §3.6 (M2.7, ADR 0145).
export function versionEntries(): TypeEntry[] {
  return [
    command(
      'kernel.extension.reload', 'all',
      'Reloads an extension, or switches it to another installed digest (upgrade), running its data migrations. Admin only; with grants, confirmed in the grant dialog.',
      extensionReloadRequestSchema, extensionReloadResultSchema,
    ),
    command('kernel.extension.rollback', 'all', 'Switches an extension back to another installed digest, when its data version allows it. Admin only.', extensionRollbackRequestSchema, extensionReloadResultSchema),
    command('kernel.extension.unquarantine', 'user', 'Lifts a quarantine caused by host failures, so the extension runs again.', extensionUnquarantineRequestSchema, extensionUnquarantineResultSchema),
    event('kernel.extension.reloaded', 'An extension was reloaded, upgraded, or rolled back; published once for each workspace where it is enabled.', extensionReloadedSchema),
  ];
}

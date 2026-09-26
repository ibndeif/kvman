import type { Preset } from '@kvman/protocol';
import type { OpenedFolder } from '../workspaces/workspace-paths.ts';
import type { Connection } from './driver.ts';

// A workspace row as kernel.workspace.open writes it (07 §7.1).
export function insertWorkspace(connection: Connection, folder: OpenedFolder, createdAt: number): void {
  connection
    .prepare('INSERT INTO workspaces (id, path, name, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO NOTHING')
    .run(folder.workspaceId, folder.path, folder.name, createdAt);
}

// ADR 0124: an applied preset written whole at its own revision, replacing the workspace's previous one; preset
// apply (M2.8) and the test helper write presets through it.
export function writeAppliedPreset(connection: Connection, workspaceId: string, preset: Preset, appliedAt: number): void {
  connection
    .prepare(`INSERT INTO workspace_presets (workspace_id, preset, revision, applied_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(workspace_id) DO UPDATE SET preset = excluded.preset, revision = excluded.revision, applied_at = excluded.applied_at`)
    .run(workspaceId, JSON.stringify(preset), preset.revision, appliedAt);
}

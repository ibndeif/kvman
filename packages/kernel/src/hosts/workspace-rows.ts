import { workspaceKindSchema, type HostWorkspace, type WorkspaceKind } from '@kvman/protocol';
import type { Connection } from '../storage/driver.ts';

// ctx.workspace comes from the workspaces row (ADR 0075).
export function readWorkspace(connection: Connection, workspaceId: string): HostWorkspace | undefined {
  const row = connection.prepare('SELECT id, path, name FROM workspaces WHERE id = ?').get(workspaceId);
  return row === undefined ? undefined : { id: String(row['id']), path: String(row['path']), name: String(row['name']) };
}

// 07 §7.1, ADR 0150: a workspace's kind for the preview rules; undefined when it has no row.
export function readWorkspaceKind(connection: Connection, workspaceId: string): WorkspaceKind | undefined {
  const row = connection.prepare('SELECT kind FROM workspaces WHERE id = ?').get(workspaceId);
  return row === undefined ? undefined : workspaceKindSchema.parse(row['kind']);
}

import type { HostWorkspace } from '@kvman/protocol';
import type { Connection } from '../storage/driver.ts';

// ctx.workspace comes from the workspaces row (ADR 0075).
export function readWorkspace(connection: Connection, workspaceId: string): HostWorkspace | undefined {
  const row = connection.prepare('SELECT id, path, name FROM workspaces WHERE id = ?').get(workspaceId);
  return row === undefined ? undefined : { id: String(row['id']), path: String(row['path']), name: String(row['name']) };
}

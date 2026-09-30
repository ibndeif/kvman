import { realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import type { Workspace } from '@kvman/sdk';
import type { IdGenerator } from '../ids.ts';
import { kernelProblem } from '../problems.ts';
import type { Connection } from '../storage/database.ts';

// Workspaces (plan 02 §2.6, ADR 0009, 22): folders on disk, remembered across restarts. Home, the user's home folder,
// is built in and always open; closing another pauses it, and opening its path again brings back its id and data.

export const homeWorkspaceId = 'home';

// The ids of the closed workspaces, whose queued jobs and due schedules wait. The main thread is the only writer of
// workspaces (ADR 0009, 19), so it keeps them in memory.
export type ClosedWorkspaces = () => readonly string[];

// The SQL clause, joined by `WHERE` or `AND`, that leaves out rows of closed workspaces, with their ids as its
// parameters; with none closed it is empty, so the common case costs nothing.
export function outsideClosed(joiner: 'WHERE' | 'AND', closed: readonly string[]): string {
  return closed.length === 0 ? '' : ` ${joiner} workspace_id NOT IN (${closed.map(() => '?').join(', ')})`;
}

type Row = { id: string; name: string; path: string; open: number };

export function homeWorkspace(homeFolder: string): Workspace {
  return { id: homeWorkspaceId, name: path.basename(homeFolder), path: homeFolder };
}

// The open workspace with this id; a closed or unknown one fails NOT_FOUND.
export function openWorkspaceOf(connection: Connection, homeFolder: string, id: string): Workspace {
  if (id === homeWorkspaceId) return homeWorkspace(homeFolder);
  const row = connection.prepare<[string], Workspace>('SELECT id, name, path FROM workspaces WHERE id = ? AND open = 1').get(id);
  if (row === undefined) throw kernelProblem('NOT_FOUND', `There is no open workspace ${id}.`, { workspaceId: id });
  return row;
}

// Home, then the open workspaces in the order they were first opened (their ids are UUIDv7).
export function listWorkspaces(connection: Connection, homeFolder: string): Workspace[] {
  const others = connection.prepare<[], Workspace>('SELECT id, name, path FROM workspaces WHERE open = 1 ORDER BY id').all();
  return [homeWorkspace(homeFolder), ...others];
}

function realFolder(folder: string): string {
  if (!path.isAbsolute(folder)) throw kernelProblem('VALIDATION_FAILED', 'A workspace path must be absolute.', { path: folder });
  let isFolder: boolean;
  try {
    isFolder = statSync(folder).isDirectory();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw kernelProblem('VALIDATION_FAILED', `The workspace path can't be read (${reason}).`, { path: folder });
  }
  if (!isFolder) throw kernelProblem('VALIDATION_FAILED', 'A workspace path must be a folder.', { path: folder });
  return realpathSync.native(folder);
}

export type Workspaces = ReturnType<typeof createWorkspaces>;

export function createWorkspaces(connection: Connection, homeFolder: string, ids: IdGenerator) {
  const closed = new Set(connection.prepare<[], { id: string }>('SELECT id FROM workspaces WHERE open = 0').all().map((row) => row.id));
  return {
    closed: (): readonly string[] => [...closed],
    // Opens a folder: Home for Home's own folder, the existing workspace for an open path, the remembered one for a
    // closed path, or a new one; `firstOpened` runs in the same transaction as a new workspace's row.
    open(folder: string, firstOpened: (workspaceId: string) => void): Workspace {
      const real = realFolder(folder);
      if (real === realpathSync.native(homeFolder)) return homeWorkspace(homeFolder);
      return connection.transaction(() => {
        const row = connection.prepare<[string], Row>('SELECT * FROM workspaces WHERE path = ?').get(real);
        if (row !== undefined) {
          connection.prepare('UPDATE workspaces SET open = 1 WHERE id = ?').run(row.id);
          closed.delete(row.id);
          return { id: row.id, name: row.name, path: row.path };
        }
        const workspace = { id: ids(), name: path.basename(real), path: real };
        connection.prepare('INSERT INTO workspaces (id, name, path, open) VALUES (?, ?, ?, 1)').run(workspace.id, workspace.name, workspace.path);
        firstOpened(workspace.id);
        return workspace;
      })();
    },
    close(id: string): void {
      if (id === homeWorkspaceId) throw kernelProblem('VALIDATION_FAILED', "Home can't be closed.", { workspaceId: id });
      const changed = connection.prepare('UPDATE workspaces SET open = 0 WHERE id = ? AND open = 1').run(id).changes;
      if (changed === 0) throw kernelProblem('NOT_FOUND', `There is no open workspace ${id}.`, { workspaceId: id });
      closed.add(id);
    },
    // Home counts as first opened on the first start of a new home (plan 02 §2.15).
    openHomeFirstTime(firstOpened: (workspaceId: string) => void): void {
      connection.transaction(() => {
        const marked = connection.prepare("INSERT INTO kernel_state (key, value) VALUES ('home-opened', 'true') ON CONFLICT DO NOTHING").run().changes;
        if (marked === 1) firstOpened(homeWorkspaceId);
      })();
    },
  };
}

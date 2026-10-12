import { rmSync } from 'node:fs';
import path from 'node:path';
import type { Dispatcher } from '../jobs/dispatcher.ts';
import { listProcesses } from '../processes/process-rows.ts';
import type { ProcessService } from '../processes/process-service.ts';
import type { Connection } from '../storage/database.ts';
import { homeWorkspaceId, type Workspaces } from './workspaces.ts';

// Deleting a closed workspace (plan 02 §2.6; ADR 0061, 3): its running work is stopped first; then one transaction
// deletes everything the kernel holds for it and queues the `kernel.workspace.deleted` handler jobs, which run in
// Home. The contents of its files go after the transaction, and its folder on disk is never touched.

export type DeleteWorkspaceServices = {
  connection: Connection;
  home: string;
  dispatcher: Pick<Dispatcher, 'cancelRunningIn' | 'deliverAlong'>;
  processes: Pick<ProcessService, 'stop'>;
  workspaces: Pick<Workspaces, 'closedOne' | 'forget'>;
};

// The tables that hold a workspace's rows, with the column that names it.
const scoped = [
  ['store_kv', 'scope'],
  ['store_documents', 'scope'],
  ['settings', 'scope'],
  ['files', 'workspace_id'],
  ['jobs', 'workspace_id'],
  ['schedules', 'workspace_id'],
  ['processes', 'workspace_id'],
] as const;

export async function deleteWorkspace(services: DeleteWorkspaceServices, workspaceId: string): Promise<void> {
  const { connection, dispatcher, processes, workspaces } = services;
  workspaces.closedOne(workspaceId);
  await dispatcher.cancelRunningIn(workspaceId);
  for (const row of listProcesses(connection).filter((process) => process.workspaceId === workspaceId)) await processes.stop(row.extension, workspaceId, row.name);
  const fileIds = dispatcher.deliverAlong((deliverIn) => {
    // It may have been opened again while its work was being stopped.
    workspaces.closedOne(workspaceId);
    const ids = connection.prepare<[string], { id: string }>('SELECT id FROM files WHERE workspace_id = ?').all(workspaceId).map((row) => row.id);
    for (const [table, column] of scoped) connection.prepare(`DELETE FROM ${table} WHERE ${column} = ?`).run(workspaceId);
    workspaces.forget(workspaceId);
    deliverIn('kernel.workspace.deleted', { workspaceId }, homeWorkspaceId);
    return ids;
  });
  for (const id of fileIds) rmSync(path.join(services.home, 'files', id), { force: true });
}

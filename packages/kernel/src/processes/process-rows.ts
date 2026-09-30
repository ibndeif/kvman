import type { ProcessInfo } from '@kvman/sdk';
import type { Connection } from '../storage/database.ts';

// The rows of running long-lived processes (plan 02 §2.16): written by the main thread, which owns the processes, and
// read by any thread.

export type ProcessRow = ProcessInfo & { extension: string; workspaceId: string };

type Row = { extension: string; workspace_id: string; name: string; pid: number; started_at: string };

function processOfRow(row: Row): ProcessRow {
  return { extension: row.extension, workspaceId: row.workspace_id, name: row.name, pid: row.pid, startedAt: row.started_at };
}

export function listProcesses(connection: Connection): ProcessRow[] {
  return connection.prepare<[], Row>('SELECT * FROM processes ORDER BY started_at, extension, workspace_id, name').all().map(processOfRow);
}

export function listOwnProcesses(connection: Connection, extension: string, workspaceId: string): ProcessInfo[] {
  return connection
    .prepare<[string, string], Row>('SELECT * FROM processes WHERE extension = ? AND workspace_id = ? ORDER BY started_at, name')
    .all(extension, workspaceId)
    .map((row) => ({ name: row.name, pid: row.pid, startedAt: row.started_at }));
}

export function insertProcess(connection: Connection, row: ProcessRow): void {
  connection
    .prepare('INSERT INTO processes (extension, workspace_id, name, pid, started_at) VALUES (?, ?, ?, ?, ?)')
    .run(row.extension, row.workspaceId, row.name, row.pid, row.startedAt);
}

export function deleteProcess(connection: Connection, row: Pick<ProcessRow, 'extension' | 'workspaceId' | 'name'>): void {
  connection.prepare('DELETE FROM processes WHERE extension = ? AND workspace_id = ? AND name = ?').run(row.extension, row.workspaceId, row.name);
}

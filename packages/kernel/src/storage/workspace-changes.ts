import type { Json, WorkspaceEvent } from '@kvman/protocol';
import { kernelProblem } from '../problems.ts';
import { insertWorkspace } from './applied-presets.ts';
import { cancelMessages } from './message-ending.ts';
import { publishKernelEvent, UnitRejected, type UnitScope } from './unit-contents.ts';

// The kernel's writes to the workspaces table (07 §7.1, 04 §4.4, ADRs 0122 and 0127).
export type WorkspaceChange =
  | { kind: 'workspace.open'; workspaceId: string; path: string; name: string }
  | { kind: 'workspace.rename'; workspaceId: string; name: string }
  | { kind: 'workspace.forget'; workspaceId: string }
  // 04 §4.4 step 2: every unfinished message of the workspace but the forget's own, with kernel.cancel semantics.
  | { kind: 'workspace.cancel'; workspaceId: string; except: string };

// Every table that holds a workspace's rows, by the column that names it (04 §4.4 step 3); steps and recorded values
// go with their messages, and the workspaces row goes last.
const workspaceTables = [
  ['kv', 'ws'], ['docs', 'ws'], ['logs', 'ws'], ['blob_refs', 'ws'], ['events', 'workspace_id'], ['llm_usage', 'ws'],
  ['workspace_presets', 'workspace_id'], ['workspace_config', 'workspace_id'], ['notifications', 'ws'], ['processes', 'ws'], ['schedules', 'ws'],
] as const;

function announce(scope: UnitScope, type: string, workspaceId: string): void {
  const payload: WorkspaceEvent = { workspaceId };
  publishKernelEvent(scope, undefined, { type, payload });
}

// A folder opened again keeps its row and name; every open is announced (ADR 0127).
function open(scope: UnitScope, change: Extract<WorkspaceChange, { kind: 'workspace.open' }>): Json {
  insertWorkspace(scope.connection, change, scope.now);
  announce(scope, 'kernel.workspace.opened', change.workspaceId);
  return { workspaceId: change.workspaceId };
}

function rename(scope: UnitScope, change: Extract<WorkspaceChange, { kind: 'workspace.rename' }>): Json {
  const updated = scope.connection.prepare('UPDATE workspaces SET name = ? WHERE id = ?').run(change.name, change.workspaceId);
  if (updated.changes === 0) {
    throw new UnitRejected(kernelProblem('WORKSPACE_INVALID', { correlationId: scope.correlationId, detail: `no workspace ${change.workspaceId} exists` }));
  }
  announce(scope, 'kernel.workspace.renamed', change.workspaceId);
  return {};
}

// Continuations this unit stored for the cancelled messages were deleted with them; nothing may schedule them.
function dropDeleted(scope: UnitScope, workspaceId: string): void {
  const { applied } = scope;
  const inserted = applied.inserted.filter((stored) => stored.message.workspaceId !== workspaceId);
  applied.inserted.splice(0, applied.inserted.length, ...inserted);
  const logged = applied.logged.filter((entry) => entry.event.workspaceId !== workspaceId);
  applied.logged.splice(0, applied.logged.length, ...logged);
}

// 04 §4.4 step 3: what the settle left unfinished is cancelled without onAbort, then every row of the workspace goes
// in this transaction. The forget command's own row goes with them; its reply still reaches its waiters.
function forget(scope: UnitScope, workspaceId: string): Json {
  const { connection } = scope;
  cancelMessages(scope, unfinishedIn(scope, workspaceId, scope.cause?.id ?? ''), { sendAbort: false });
  connection.prepare('DELETE FROM steps WHERE message_id IN (SELECT id FROM messages WHERE workspace_id = ?)').run(workspaceId);
  connection.prepare('DELETE FROM recorded_values WHERE message_id IN (SELECT id FROM messages WHERE workspace_id = ?)').run(workspaceId);
  connection.prepare('DELETE FROM messages WHERE workspace_id = ?').run(workspaceId);
  connection.prepare("DELETE FROM blob_refs WHERE ref IN (SELECT 'process:' || id FROM processes WHERE ws = ?)").run(workspaceId);
  for (const [table, column] of workspaceTables) connection.prepare(`DELETE FROM ${table} WHERE ${column} = ?`).run(workspaceId);
  connection.prepare('DELETE FROM workspaces WHERE id = ?').run(workspaceId);
  dropDeleted(scope, workspaceId);
  announce(scope, 'kernel.workspace.forgotten', workspaceId);
  return {};
}

function unfinishedIn(scope: UnitScope, workspaceId: string, except: string): string[] {
  return scope.connection
    .prepare(`SELECT id FROM messages WHERE workspace_id = ? AND state IN ('pending', 'running', 'awaiting') AND id != ? ORDER BY seq`)
    .all(workspaceId, except)
    .map((row) => String(row['id']));
}

export function applyWorkspaceChange(scope: UnitScope, change: WorkspaceChange): Json {
  if (change.kind === 'workspace.open') return open(scope, change);
  if (change.kind === 'workspace.rename') return rename(scope, change);
  if (change.kind === 'workspace.cancel') return { cancelled: cancelMessages(scope, unfinishedIn(scope, change.workspaceId, change.except)) };
  return forget(scope, change.workspaceId);
}

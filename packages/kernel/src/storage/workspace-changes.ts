import type { Json, PresetChanged, WorkspaceEvent } from '@kvman/protocol';
import { kernelProblem } from '../problems.ts';
import { insertWorkspace, writeAppliedPreset } from './applied-presets.ts';
import { cancelMessages } from './message-ending.ts';
import { readAppliedPreset } from './preset-changes.ts';
import { publishKernelEvent, UnitRejected, type UnitScope } from './unit-contents.ts';

// The kernel's writes to the workspaces table (07 §7.1, 04 §4.4, ADRs 0122 and 0127).
export type WorkspaceChange =
  | { kind: 'workspace.open'; workspaceId: string; path: string; name: string }
  | { kind: 'workspace.rename'; workspaceId: string; name: string }
  | { kind: 'workspace.forget'; workspaceId: string }
  // 04 §4.4 step 2: every unfinished message of the workspace but the forget's own, with kernel.cancel semantics.
  | { kind: 'workspace.cancel'; workspaceId: string; except: string }
  // 07 §7.1, ADR 0150: a preview workspace copying another workspace's applied preset and config rows.
  | { kind: 'workspace.preview'; workspaceId: string; path: string; name: string; from: string };

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

// 07 §7.1, ADR 0150: the preview row with kind 'preview', the copied preset and config rows at revision 1, and the
// opened and changed events. The reads run in the same transaction, so a `from` forgotten first is refused here.
function preview(scope: UnitScope, change: Extract<WorkspaceChange, { kind: 'workspace.preview' }>): Json {
  const { connection, correlationId, now } = scope;
  const { workspaceId, path, name, from } = change;
  if (connection.prepare('SELECT 1 AS found FROM workspaces WHERE id = ?').get(from) === undefined) {
    throw new UnitRejected(kernelProblem('WORKSPACE_INVALID', { correlationId, detail: `no workspace ${from} exists` }));
  }
  const source = readAppliedPreset(scope, from);
  if (source === undefined) {
    throw new UnitRejected(kernelProblem('PRESET_REQUIRED', { correlationId, detail: `workspace ${from} has no applied preset`, hint: 'choose a preset for the workspace first' }));
  }
  if (connection.prepare('SELECT 1 AS found FROM workspaces WHERE id = ?').get(workspaceId) !== undefined) {
    throw new UnitRejected(kernelProblem('WORKSPACE_INVALID', { correlationId, detail: `a preview named ${name} exists`, hint: 'forget it first' }));
  }
  connection
    .prepare(`INSERT INTO workspaces (id, path, name, kind, created_at) VALUES (?, ?, ?, 'preview', ?)`)
    .run(workspaceId, path, name, now);
  writeAppliedPreset(connection, workspaceId, { ...source.preset, revision: 1 }, now);
  const configs = connection.prepare('SELECT extension, value FROM workspace_config WHERE workspace_id = ?').all(from);
  for (const config of configs) {
    connection
      .prepare('INSERT INTO workspace_config (workspace_id, extension, value, revision, updated_at) VALUES (?, ?, ?, 1, ?)')
      .run(workspaceId, String(config['extension']), String(config['value']), now);
  }
  const opened: WorkspaceEvent = { workspaceId };
  publishKernelEvent(scope, undefined, { type: 'kernel.workspace.opened', payload: opened });
  const changed: PresetChanged = { workspaceId, revision: 1, cause: 'apply' };
  publishKernelEvent(scope, workspaceId, { type: 'kernel.preset.changed', payload: changed });
  return { workspaceId };
}

export function applyWorkspaceChange(scope: UnitScope, change: WorkspaceChange): Json {
  if (change.kind === 'workspace.open') return open(scope, change);
  if (change.kind === 'workspace.rename') return rename(scope, change);
  if (change.kind === 'workspace.cancel') return { cancelled: cancelMessages(scope, unfinishedIn(scope, change.workspaceId, change.except)) };
  if (change.kind === 'workspace.preview') return preview(scope, change);
  return forget(scope, change.workspaceId);
}

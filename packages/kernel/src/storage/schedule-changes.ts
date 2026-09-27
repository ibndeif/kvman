import type { Json, ScheduleEntry } from '@kvman/protocol';
import { nextOccurrence } from '../schedules/occurrences.ts';
import type { Sender } from './commit-unit.ts';
import { cancelMessages } from './message-ending.ts';
import { readMessageState } from './stored-message.ts';
import { recordSend, type UnitScope } from './unit-contents.ts';

// One run the registry wants: a schedule of an enabled extension in a workspace ('' for a global command).
export type DesiredRun = { extension: string; name: string; ws: string; entry: ScheduleEntry };

// ADR 0144: the rows are made to match the desired runs. `paused` names quarantined extensions, whose rows stay.
export type ScheduleChange = { kind: 'schedules.reconcile'; desired: readonly DesiredRun[]; paused: readonly string[] };

type ScheduleRow = { extension: string; name: string; ws: string; anchorAt: number; messageId: string | undefined };

const kernelSender: Sender = { address: 'kernel' };
const finished = new Set(['done', 'failed', 'dead', 'cancelled']);

function keyOf(run: { extension: string; name: string; ws: string }): string {
  return `${run.extension}\n${run.name}\n${run.ws}`;
}

function readRows(scope: UnitScope): ScheduleRow[] {
  return scope.connection.prepare('SELECT extension, name, ws, anchor_at, message_id FROM schedules').all().map((row) => ({
    extension: String(row['extension']), name: String(row['name']), ws: String(row['ws']), anchorAt: Number(row['anchor_at']),
    messageId: typeof row['message_id'] === 'string' ? row['message_id'] : undefined,
  }));
}

// A run is outstanding while its message is unfinished; a missing or ended message (or none) needs the next run.
function outstanding(scope: UnitScope, row: ScheduleRow): boolean {
  if (row.messageId === undefined) return false;
  const state = readMessageState(scope.connection, row.messageId);
  return state !== undefined && !finished.has(state);
}

// The next run is a command from the kernel due at the first occurrence after now. It needs no idempotency key: the
// run and its row commit in one unit, so a later reconcile always finds the run. A send the router refuses (its
// extension became unavailable) leaves the row without a message until a later reconcile.
function startRun(scope: UnitScope, run: DesiredRun, anchorAt: number): void {
  const dueAt = nextOccurrence(run.entry, anchorAt, scope.now);
  if (dueAt === undefined) return;
  const send = { type: run.entry.command, payload: run.entry.payload ?? {}, at: dueAt };
  const result = scope.admission.admitSend(scope.connection, { send, sender: kernelSender, cause: undefined, workspaceId: run.ws === '' ? undefined : run.ws, index: 0, received: new Set() });
  let messageId: string | null = null;
  if (result.outcome !== 'refused') {
    recordSend(scope, result);
    messageId = result.outcome === 'admitted' ? result.admitted.message.id : result.original.id;
  }
  scope.connection
    .prepare(`INSERT INTO schedules (extension, name, ws, anchor_at, due_at, message_id) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(extension, name, ws) DO UPDATE SET due_at = excluded.due_at, message_id = excluded.message_id`)
    .run(run.extension, run.name, run.ws, anchorAt, dueAt, messageId);
}

function reconcile(scope: UnitScope, change: ScheduleChange): Json {
  const paused = new Set(change.paused);
  const desired = new Map(change.desired.map((run) => [keyOf(run), run]));
  const rows = new Map(readRows(scope).map((row) => [keyOf(row), row]));
  let cancelled = 0;
  for (const [key, row] of rows) {
    if (desired.has(key) || paused.has(row.extension)) continue;
    if (row.messageId !== undefined) cancelled += cancelMessages(scope, [row.messageId]);
    scope.connection.prepare('DELETE FROM schedules WHERE extension = ? AND name = ? AND ws = ?').run(row.extension, row.name, row.ws);
  }
  let started = 0;
  for (const [key, run] of desired) {
    const row = rows.get(key);
    if (row !== undefined && outstanding(scope, row)) continue;
    startRun(scope, run, row?.anchorAt ?? scope.now);
    started += 1;
  }
  return { started, cancelled };
}

export function applyScheduleChange(scope: UnitScope, change: ScheduleChange): Json {
  return reconcile(scope, change);
}

import { messageSchema, processExitReasonSchema, type Message, type ProcessExitReason } from '@kvman/protocol';
import { StorageFailure, type Connection, type SqlRow } from './driver.ts';

// A process as the supervisor records it before releasing it (03 §3.7, ADR 0139). `spawnedBy` is the spawning
// message's envelope without its payload, which onExit inherits its context and correlation from.
export type ProcessRecord = {
  processId: string;
  messageId: string;
  extension: string;
  workspaceId: string | undefined;
  command: string;
  pid: number;
  processStart: string;
  logPath: string;
  detached: boolean;
  onExit: string | undefined;
  spawnedBy: Message;
  startedAt: number;
};

export type ProcessEnd = {
  processId: string;
  reason: ProcessExitReason;
  exitCode: number | null;
  signal: string | null;
  logBlobId: string;
  truncated: boolean;
  endedAt: number;
};

export function processRef(processId: string): string {
  return `process:${processId}`;
}

export function envelopeOf(message: Message): Message {
  return { ...message, payload: null };
}

export function insertProcess(connection: Connection, record: ProcessRecord): void {
  connection
    .prepare(`INSERT INTO processes (id, message_id, extension, pid, pgid, process_start, state, log_path, started_at, ws, command, detached, on_exit, spawned_by)
      VALUES (?, ?, ?, ?, ?, ?, 'running', ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      record.processId, record.messageId, record.extension, record.pid, record.pid, record.processStart, record.logPath, record.startedAt,
      record.workspaceId ?? null, record.command, record.detached ? 1 : 0, record.onExit ?? null, JSON.stringify(envelopeOf(record.spawnedBy)),
    );
}

export function markTruncated(connection: Connection, processId: string): void {
  connection.prepare('UPDATE processes SET truncated = 1 WHERE id = ?').run(processId);
}

// The row ends once: false when it already ended, or is gone.
export function endProcessRow(connection: Connection, end: ProcessEnd): boolean {
  const state = end.reason === 'exited' ? 'exited' : 'killed';
  return connection
    .prepare(`UPDATE processes SET state = ?, reason = ?, exit_code = ?, signal = ?, log_blob = ?, truncated = ?, ended_at = ?
      WHERE id = ? AND state = 'running'`)
    .run(state, end.reason, end.exitCode, end.signal, end.logBlobId, end.truncated ? 1 : 0, end.endedAt, end.processId).changes > 0;
}

function envelopeFrom(row: SqlRow): Message {
  const parsed = messageSchema.safeParse(JSON.parse(String(row['spawned_by'])));
  if (!parsed.success) throw new StorageFailure('corrupt', `the spawning message of process ${String(row['id'])} does not match its schema`);
  return parsed.data;
}

function recordFrom(row: SqlRow): ProcessRecord & { truncated: boolean } {
  const workspaceId = row['ws'];
  const onExit = row['on_exit'];
  return {
    processId: String(row['id']), messageId: String(row['message_id']), extension: String(row['extension']),
    workspaceId: workspaceId === null || workspaceId === undefined ? undefined : String(workspaceId), command: String(row['command']),
    pid: Number(row['pid']), processStart: String(row['process_start']), logPath: String(row['log_path']), detached: Number(row['detached']) === 1,
    onExit: onExit === null || onExit === undefined ? undefined : String(onExit), spawnedBy: envelopeFrom(row), startedAt: Number(row['started_at']),
    truncated: Number(row['truncated']) === 1,
  };
}

// What boot reconciliation finds still running (03 §3.9 step 6).
export function runningProcesses(connection: Connection): Array<ProcessRecord & { truncated: boolean }> {
  return connection.prepare("SELECT * FROM processes WHERE state = 'running' ORDER BY started_at").all().map(recordFrom);
}

export type StoredOwner = { extension: string; ended: boolean; messageId: string };

export function processOwner(connection: Connection, processId: string): StoredOwner | undefined {
  const row = connection.prepare('SELECT extension, state, message_id FROM processes WHERE id = ?').get(processId);
  if (row === undefined) return undefined;
  return { extension: String(row['extension']), ended: row['state'] !== 'running', messageId: String(row['message_id']) };
}

export function reasonOf(value: unknown): ProcessExitReason | undefined {
  const parsed = processExitReasonSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

// 04 §4.9, ADR 0139: ended rows and their log refs go 7 days after the end; their blobs are then GC's.
export function deleteExpiredProcesses(connection: Connection, before: number): number {
  connection.prepare("DELETE FROM blob_refs WHERE ref IN (SELECT 'process:' || id FROM processes WHERE state != 'running' AND ended_at <= ?)").run(before);
  return connection.prepare("DELETE FROM processes WHERE state != 'running' AND ended_at <= ?").run(before).changes;
}

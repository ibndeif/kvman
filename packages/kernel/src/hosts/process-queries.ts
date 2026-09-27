import {
  processesListLimits, processesListRequestSchema, processSummarySchema, type Message, type ProcessesListResult, type ProcessSummary,
} from '@kvman/protocol';
import type { GrantsSource } from '../router/grants.ts';
import type { Connection, SqlRow, SqlValue } from '../storage/driver.ts';
import { isAdministrator } from './administrators.ts';
import type { ExtensionQueryAnswer } from './extension-queries.ts';

function present(value: SqlValue | undefined): SqlValue | undefined {
  return value === null ? undefined : value;
}

function summaryOf(row: SqlRow): ProcessSummary {
  const optional = {
    workspaceId: present(row['ws']), endedAt: present(row['ended_at']), exitCode: present(row['exit_code']), signal: present(row['signal']),
    reason: present(row['reason']), logBlobId: present(row['log_blob']),
  };
  return processSummarySchema.parse({
    processId: row['id'], extension: row['extension'], messageId: row['message_id'], command: row['command'], pid: row['pid'], state: row['state'],
    detached: Number(row['detached']) === 1, startedAt: row['started_at'],
    ...Object.fromEntries(Object.entries(optional).filter(([, value]) => value !== undefined)),
  });
}

// kernel.processes.list (03 §3.8, ADR 0139): an extension lists its own processes, an administrator every one, and a
// process none. Items never carry args, environment, stdin, or output.
export class ProcessQueries {
  readonly #connection: Connection;
  readonly #grants: GrantsSource;

  constructor(connection: Connection, grants: GrantsSource) {
    this.#connection = connection;
    this.#grants = grants;
  }

  list(message: Message): ExtensionQueryAnswer<ProcessesListResult> {
    const request = processesListRequestSchema.parse(message.payload);
    const { source } = message;
    if (source.startsWith('proc:')) return { ok: false, code: 'CAPABILITY_DENIED', detail: 'a process may not list processes' };
    let extension = request.extension;
    if (!isAdministrator(this.#grants, message)) {
      const own = source.slice('ext:'.length);
      if (extension !== undefined && extension !== own) return { ok: false, code: 'CAPABILITY_DENIED', detail: `${own} may list only its own processes; others need kernel.admin` };
      extension = own;
    }
    const conditions: Array<{ sql: string; value: string }> = [];
    if (extension !== undefined) conditions.push({ sql: 'extension = ?', value: extension });
    if (request.state !== undefined) conditions.push({ sql: 'state = ?', value: request.state });
    const where = conditions.length === 0 ? '' : ` WHERE ${conditions.map((condition) => condition.sql).join(' AND ')}`;
    const values = conditions.map((condition) => condition.value);
    const total = Number(this.#connection.prepare(`SELECT count(*) AS total FROM processes${where}`).get(...values)?.['total'] ?? 0);
    const rows = this.#connection.prepare(`SELECT * FROM processes${where} ORDER BY started_at DESC, id DESC LIMIT ?`).all(...values, request.limit ?? processesListLimits.defaultLimit);
    return { ok: true, value: { items: rows.map(summaryOf), total } };
  }
}

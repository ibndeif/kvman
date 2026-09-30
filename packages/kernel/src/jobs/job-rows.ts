import { jobSchema, type Caller, type Job, type Problem } from '@kvman/sdk';
import type { Clock } from '../clock.ts';
import type { IdGenerator } from '../ids.ts';
import type { Connection } from '../storage/database.ts';

// The rows of async and scheduled jobs (plan 02 §2.1), written only by the main thread (ADR 0009, 19).

export type NewJob = {
  name: string;
  input: unknown;
  workspaceId: string;
  caller: Caller;
  retries: number;
  fromHandler: boolean;
  handlerExtension?: string;
  runAt: number;
};

export type ClaimedJob = {
  id: string;
  name: string;
  input: unknown;
  workspaceId: string;
  caller: Caller;
  attempts: number;
  retries: number;
  fromHandler: boolean;
  handlerExtension: string | undefined;
};

type Row = {
  id: string;
  name: string;
  input: string;
  workspace_id: string;
  caller: string;
  status: string;
  attempts: number;
  retries: number;
  output: string | null;
  problem: string | null;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
  from_handler: number;
  handler_extension: string | null;
};

const iso = (time: number): string => new Date(time).toISOString();

function parsed(text: string): unknown {
  return JSON.parse(text);
}

export function jobOfRow(row: Row): Job {
  return jobSchema.parse({
    id: row.id,
    name: row.name,
    input: parsed(row.input),
    workspaceId: row.workspace_id,
    caller: parsed(row.caller),
    status: row.status,
    attempts: row.attempts,
    retries: row.retries,
    ...(row.output === null ? {} : { output: parsed(row.output) }),
    ...(row.problem === null ? {} : { problem: parsed(row.problem) }),
    createdAt: row.created_at,
    ...(row.started_at === null ? {} : { startedAt: row.started_at }),
    ...(row.ended_at === null ? {} : { endedAt: row.ended_at }),
  });
}

function claimedOfRow(row: Row): ClaimedJob {
  const job = jobOfRow(row);
  return {
    id: job.id,
    name: job.name,
    input: job.input,
    workspaceId: job.workspaceId,
    caller: job.caller,
    attempts: job.attempts,
    retries: job.retries,
    fromHandler: row.from_handler === 1,
    handlerExtension: row.handler_extension ?? undefined,
  };
}

export type JobRows = ReturnType<typeof createJobRows>;

export function createJobRows(connection: Connection, clock: Clock, ids: IdGenerator) {
  const byId = (id: string): Row | undefined => connection.prepare<[string], Row>('SELECT * FROM jobs WHERE id = ?').get(id);
  const end = (id: string, status: 'succeeded' | 'failed' | 'cancelled', output: unknown, problem: Problem | undefined): void => {
    connection
      .prepare("UPDATE jobs SET status = ?, output = ?, problem = ?, ended_at = ? WHERE id = ? AND status IN ('queued', 'running')")
      .run(status, output === undefined ? null : JSON.stringify(output), problem === undefined ? null : JSON.stringify(problem), iso(clock.now()), id);
  };
  return {
    insert(job: NewJob): string {
      const id = ids();
      connection
        .prepare(
          `INSERT INTO jobs (id, name, input, workspace_id, caller, status, attempts, retries, created_at, run_at, from_handler, handler_extension)
           VALUES (?, ?, ?, ?, ?, 'queued', 0, ?, ?, ?, ?, ?)`,
        )
        .run(id, job.name, JSON.stringify(job.input), job.workspaceId, JSON.stringify(job.caller), job.retries, iso(clock.now()), iso(job.runAt), job.fromHandler ? 1 : 0, job.handlerExtension ?? null);
      return id;
    },
    // Due queued jobs, first-in, first-out; while kvman stops, only the handlers of one point start.
    claimDue(limit: number, onlyPoint: string | undefined): ClaimedJob[] {
      const now = iso(clock.now());
      const rows =
        onlyPoint === undefined
          ? connection.prepare<[string, number], Row>("SELECT * FROM jobs WHERE status = 'queued' AND run_at <= ? ORDER BY id LIMIT ?").all(now, limit)
          : connection
              .prepare<[string, string, number], Row>("SELECT * FROM jobs WHERE status = 'queued' AND run_at <= ? AND name = ? AND handler_extension IS NOT NULL ORDER BY id LIMIT ?")
              .all(now, onlyPoint, limit);
      const start = connection.prepare("UPDATE jobs SET status = 'running', attempts = attempts + 1, started_at = ? WHERE id = ?");
      connection.transaction(() => {
        for (const row of rows) start.run(now, row.id);
      })();
      return rows.map((row) => claimedOfRow({ ...row, attempts: row.attempts + 1 }));
    },
    succeed: (id: string, output: unknown) => end(id, 'succeeded', output, undefined),
    fail: (id: string, problem: Problem) => end(id, 'failed', undefined, problem),
    cancel: (id: string) => end(id, 'cancelled', undefined, undefined),
    requeue(id: string, problem: Problem, runAt: number): void {
      connection.prepare("UPDATE jobs SET status = 'queued', problem = ?, run_at = ? WHERE id = ?").run(JSON.stringify(problem), iso(runAt), id);
    },
    get: (id: string): Job | undefined => {
      const row = byId(id);
      return row === undefined ? undefined : jobOfRow(row);
    },
    claimed: (id: string): ClaimedJob | undefined => {
      const row = byId(id);
      return row === undefined ? undefined : claimedOfRow(row);
    },
    queuedHandlers: (point: string): ClaimedJob[] =>
      connection.prepare<[string], Row>("SELECT * FROM jobs WHERE status = 'queued' AND name = ? AND handler_extension IS NOT NULL ORDER BY id").all(point).map(claimedOfRow),
    running: (): ClaimedJob[] => connection.prepare<[], Row>("SELECT * FROM jobs WHERE status = 'running' ORDER BY id").all().map(claimedOfRow),
    earliestRunAt(): number | undefined {
      const row = connection.prepare<[], { run_at: string | null }>("SELECT min(run_at) AS run_at FROM jobs WHERE status = 'queued'").get();
      return row?.run_at === null || row === undefined ? undefined : Date.parse(row.run_at);
    },
    deleteFinishedBefore(time: number): number {
      return connection.prepare("DELETE FROM jobs WHERE status IN ('succeeded', 'failed', 'cancelled') AND ended_at < ?").run(iso(time)).changes;
    },
  };
}

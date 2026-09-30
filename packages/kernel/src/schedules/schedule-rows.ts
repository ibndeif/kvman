import { Cron } from 'croner';
import type { Clock } from '../clock.ts';
import type { IdGenerator } from '../ids.ts';
import type { NewJob } from '../jobs/job-rows.ts';
import { kernelProblem } from '../problems.ts';
import type { Connection } from '../storage/database.ts';

// Schedules (plan 02 §2.4): rows with the next run time, which croner computes for a cron. A key names a schedule per
// extension and workspace, so scheduling again with it replaces the schedule and keeps its id.

export type NewSchedule = {
  owner: string;
  workspaceId: string;
  name: string;
  input: unknown;
  timing: { at: string } | { cron: string };
  key?: string | undefined;
  retries: number;
  fromHandler: boolean;
};

type Row = {
  id: string;
  owner: string;
  name: string;
  input: string;
  at: string | null;
  cron: string | null;
  workspace_id: string;
  retries: number;
  from_handler: number;
};

const iso = (time: number): string => new Date(time).toISOString();

function nextCronRun(cron: string, after: number): number | undefined {
  return new Cron(cron, { paused: true }).nextRun(new Date(after))?.getTime();
}

function firstRun(timing: NewSchedule['timing'], now: number): number {
  if ('at' in timing) return Date.parse(timing.at);
  let next: number | undefined;
  try {
    next = nextCronRun(timing.cron, now);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw kernelProblem('VALIDATION_FAILED', `"${timing.cron}" is not a valid cron expression (${reason}).`, { cron: timing.cron });
  }
  if (next === undefined) throw kernelProblem('VALIDATION_FAILED', `The cron expression "${timing.cron}" never runs.`, { cron: timing.cron });
  return next;
}

export type ScheduleRows = ReturnType<typeof createScheduleRows>;

export function createScheduleRows(connection: Connection, clock: Clock, ids: IdGenerator) {
  return {
    upsert(schedule: NewSchedule): string {
      const nextRun = iso(firstRun(schedule.timing, clock.now()));
      const at = 'at' in schedule.timing ? schedule.timing.at : null;
      const cron = 'cron' in schedule.timing ? schedule.timing.cron : null;
      const keyed =
        schedule.key === undefined
          ? undefined
          : connection
              .prepare<[string, string, string], { id: string }>('SELECT id FROM schedules WHERE owner = ? AND workspace_id = ? AND key = ?')
              .get(schedule.owner, schedule.workspaceId, schedule.key);
      const id = keyed?.id ?? ids();
      connection
        .prepare(
          `INSERT INTO schedules (id, owner, key, name, input, at, cron, next_run, workspace_id, retries, from_handler) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (id) DO UPDATE SET name = excluded.name, input = excluded.input, at = excluded.at, cron = excluded.cron,
           next_run = excluded.next_run, retries = excluded.retries, from_handler = excluded.from_handler`,
        )
        .run(id, schedule.owner, schedule.key ?? null, schedule.name, JSON.stringify(schedule.input), at, cron, nextRun, schedule.workspaceId, schedule.retries, schedule.fromHandler ? 1 : 0);
      return id;
    },
    cancel(id: string, owner: string): void {
      const removed = connection.prepare('DELETE FROM schedules WHERE id = ? AND owner = ?').run(id, owner).changes;
      if (removed === 0) throw kernelProblem('NOT_FOUND', `There is no schedule ${id}.`, { id });
    },
    // Queues the job of every schedule that is due, once, and moves each to its next run; a one-time schedule is
    // deleted. Missed repeats are not replayed.
    queueDue(insert: (job: NewJob) => string): void {
      const now = clock.now();
      const due = connection.prepare<[string], Row>('SELECT * FROM schedules WHERE next_run <= ? ORDER BY next_run, id').all(iso(now));
      for (const row of due) {
        const input: unknown = JSON.parse(row.input);
        insert({ name: row.name, input, workspaceId: row.workspace_id, caller: { kind: 'extension', name: row.owner }, retries: row.retries, fromHandler: row.from_handler === 1, runAt: now });
        const next = row.cron === null ? undefined : nextCronRun(row.cron, now);
        if (next === undefined) connection.prepare('DELETE FROM schedules WHERE id = ?').run(row.id);
        else connection.prepare('UPDATE schedules SET next_run = ? WHERE id = ?').run(iso(next), row.id);
      }
    },
    earliestNextRun(): number | undefined {
      const row = connection.prepare<[], { next_run: string | null }>('SELECT min(next_run) AS next_run FROM schedules').get();
      return row?.next_run === null || row === undefined ? undefined : Date.parse(row.next_run);
    },
  };
}

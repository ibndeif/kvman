import { ProblemError, type Ctx, type Stored } from '@kvman/sdk';
import { delay } from '../delay.ts';
import { plainEnvironment } from '../result-text.ts';
import type { ShellCommand } from '../calls/shell-command.ts';
import { now } from '../sessions/session-lookup.ts';
import { records, txRecords } from '../store/collections.ts';
import { markEnd, processName } from './process-records.ts';
import { deleteEndedArtifacts, outputTail, reportEnd } from './process-report.ts';
import type { ProcessDoc } from '../schemas/records.ts';

// A background shell line (ADR 0009, 149): it runs in the kernel's process service, and the call returns its id and the
// first second of its output. Stopping one is kvcoder's own call, since the kernel reports no event for a stop.

/** How long a background call waits for the first output. */
const startupWindowMs = 1_000;
const firstOutputLines = 100;

export type StartedProcess = { output: string; jobId: string; ended: boolean; exitCode: number | null; signal: string | null };

/** How a start reads from its process record: running, or how it ended (ADR 0012, 7 and 9). */
export function startedOutcome(doc: Pick<ProcessDoc, 'end' | 'exitCode' | 'signal'>): { ended: boolean; exitCode: number | null; signal: string | null } {
  if (doc.end === undefined) return { ended: false, exitCode: null, signal: null };
  if (doc.end === 'exited') {
    if (typeof doc.exitCode === 'number') return { ended: true, exitCode: doc.exitCode, signal: null };
    return { ended: true, exitCode: null, signal: doc.signal ?? 'a signal' };
  }
  return { ended: true, exitCode: null, signal: null };
}

/** Starts `line` in the real shell for a session, titled by the line (ADR 0089, 1); a line that can't start fails `VALIDATION_FAILED` and leaves no record. */
export async function startProcess(ctx: Ctx, sessionId: string, shell: ShellCommand, line: string): Promise<StartedProcess> {
  const store = records(ctx.store);
  const doc = await store.processes.insert({ workspaceId: ctx.job.workspace.id, sessionId, title: line, call: line, startedAt: now(), reported: false, starting: true });
  try {
    await ctx.processes.start(processName(doc.id), { command: shell.program, args: shell.args(line), env: plainEnvironment(process.env) });
  } catch (error) {
    await store.processes.delete(doc.id);
    throw error;
  }
  await delay(startupWindowMs, ctx.job.signal);
  const output = await outputTail(ctx, doc.id, firstOutputLines);
  // The record alone decides: a process that died without its end recorded still counts as running (ADR 0012, 9).
  const settled = await ctx.store.transaction((tx) => {
    const current = txRecords(tx).processes.get(doc.id);
    if (current === undefined) return undefined;
    return current.end === undefined ? txRecords(tx).processes.update(doc.id, { starting: false }) : current;
  });
  return { output, jobId: doc.id, ...startedOutcome(settled ?? doc) };
}

/** What a stop did: whether it stopped the run, and the url artifacts of a stopped process it deleted (ADR 0104). */
export type Stopped = { stopped: boolean; deletedArtifacts: string[] };

/**
 * Stops a running process for `by`, deleting the url artifacts it served unless it starts again (the person's Restart);
 * `stopped` is `false` when it had ended already. The person's stop is reported to the session.
 */
export async function stopProcess(ctx: Ctx, doc: Stored<ProcessDoc>, by: 'agent' | 'person', restarting = false): Promise<Stopped> {
  // Reported at once for the person; the agent's stop result already says so, so it is never reported later (ADR 0085, 5).
  const ended = await markEnd(ctx, doc.id, { end: by, reported: true });
  if (ended === undefined) return { stopped: false, deletedArtifacts: [] };
  try {
    await ctx.processes.stop(processName(doc.id));
  } catch (error) {
    if (!(error instanceof ProblemError) || error.problem.code !== 'NOT_FOUND') throw error;
  }
  const deletedArtifacts = restarting ? [] : await deleteEndedArtifacts(ctx, ended);
  if (by === 'person') await reportEnd(ctx, ended, deletedArtifacts);
  return { stopped: true, deletedArtifacts };
}

/** Stops every process a session still runs, and forgets all of them (the chat is deleted). */
export async function dropProcesses(ctx: Ctx, sessionId: string): Promise<void> {
  const store = records(ctx.store);
  for (const doc of await store.processes.find({ sessionId }, { limit: 1000 })) {
    if (doc.end === undefined) await stopProcess(ctx, doc, 'agent');
    await store.processes.delete(doc.id);
  }
}

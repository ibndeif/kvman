import { ProblemError, type Ctx, type Stored } from '@kvman/sdk';
import { delay } from '../delay.ts';
import type { ShellCommand } from '../calls/shell-command.ts';
import { now } from '../sessions/session-lookup.ts';
import { records, txRecords } from '../store/collections.ts';
import { markEnd, processName } from './process-records.ts';
import { outputTail, reportEnd } from './process-report.ts';
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

/** Starts `line` in the real shell for a session; a line that can't start fails `VALIDATION_FAILED` and leaves no record. */
export async function startProcess(ctx: Ctx, sessionId: string, shell: ShellCommand, labelled: { title: string; line: string }): Promise<StartedProcess> {
  const store = records(ctx.store);
  const doc = await store.processes.insert({ workspaceId: ctx.job.workspace.id, sessionId, title: labelled.title, call: labelled.line, startedAt: now(), reported: false, starting: true });
  try {
    await ctx.processes.start(processName(doc.id), { command: shell.program, args: shell.args(labelled.line) });
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

/** Stops a running process for `by`; `false` when it had ended already. The person's stop is reported to the session. */
export async function stopProcess(ctx: Ctx, doc: Stored<ProcessDoc>, by: 'agent' | 'person'): Promise<boolean> {
  const ended = await markEnd(ctx, doc.id, { end: by, reported: by === 'person' });
  if (ended === undefined) return false;
  try {
    await ctx.processes.stop(processName(doc.id));
  } catch (error) {
    if (!(error instanceof ProblemError) || error.problem.code !== 'NOT_FOUND') throw error;
  }
  if (by === 'person') await reportEnd(ctx, ended);
  return true;
}

/** Stops every process a session still runs, and forgets all of them (the chat is deleted). */
export async function dropProcesses(ctx: Ctx, sessionId: string): Promise<void> {
  const store = records(ctx.store);
  for (const doc of await store.processes.find({ sessionId }, { limit: 1000 })) {
    if (doc.end === undefined) await stopProcess(ctx, doc, 'agent');
    await store.processes.delete(doc.id);
  }
}

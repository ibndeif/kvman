import { ProblemError, type Ctx, type Stored } from '@kvman/sdk';
import { delay } from '../delay.ts';
import { errorOutput } from '../connector-line.ts';
import { resultLines } from '../result-text.ts';
import type { ShellCommand } from '../calls/shell-command.ts';
import { now } from '../sessions/session-lookup.ts';
import { records } from '../store/collections.ts';
import { markEnd, processName } from './process-records.ts';
import { outputTail, reportEnd } from './process-report.ts';
import type { ProcessDoc } from '../schemas/records.ts';

// An async shell call (ADR 0009, 149): the command runs in the kernel's process service, and the call returns its id and
// the first second of its output. Stopping one is kvcoder's own call, since the kernel reports no event for a stop.

/** How long an async call waits for the first output. */
const startupWindowMs = 1_000;
const firstOutputLines = 100;

export type AsyncRun = { text: string; output: string; jobId: string; isError: boolean };

export async function startProcess(ctx: Ctx, sessionId: string, shell: ShellCommand, labelled: { title: string; command: string }): Promise<AsyncRun> {
  const store = records(ctx.store);
  const doc = await store.processes.insert({ workspaceId: ctx.job.workspace.id, sessionId, title: labelled.title, call: labelled.command, startedAt: now(), reported: false });
  try {
    await ctx.processes.start(processName(doc.id), { command: shell.program, args: shell.args(labelled.command) });
  } catch (error) {
    await store.processes.delete(doc.id);
    if (!(error instanceof ProblemError) || error.problem.code !== 'VALIDATION_FAILED') throw error;
    const failed = errorOutput(error.problem);
    return { text: resultLines(failed.output, failed.exitCode), output: failed.output, jobId: '', isError: true };
  }
  await delay(startupWindowMs, ctx.job.signal);
  const output = await outputTail(ctx, doc.id, firstOutputLines);
  const running = (await ctx.processes.list()).some((process) => process.name === processName(doc.id));
  const ended = running ? [] : [`[the process has already ended; jobs get ${doc.id} has its output]`];
  return { text: resultLines(`started ${doc.id}${output === '' ? '' : `\n${output}`}`, 0, ended), output, jobId: doc.id, isError: false };
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

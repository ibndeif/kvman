import { z, type Ctx } from '@kvman/sdk';
import { startProcess } from '../jobs/process-run.ts';
import { resultLines } from '../result-text.ts';
import { runShell } from './run-shell.ts';
import { callTimeout } from './shell-command.ts';
import { shellFor } from './shell-program.ts';

// One line in the real shell, in the workspace folder (plan 08 §8.3): what `shell exec` and a binary connector's `exec`
// both do. It waits for the line, or with `background` starts it in the kernel's process service and returns its id.

export const lineRunSchema = z.object({
  output: z.string(),
  exitCode: z.number().int().nullable(),
  signal: z.string().nullable(),
  timedOut: z.boolean(),
  leftoverStopped: z.boolean(),
  durationMs: z.number(),
  timeoutMs: z.number().int(),
  jobId: z.string().nullable(),
  ended: z.boolean(),
});

/** What a line's run gave: its output and exit code, or for a background run its id and how it stands. */
export type LineRun = z.output<typeof lineRunSchema>;

type LineOptions = { background?: boolean | undefined; timeoutMs?: number | undefined };

export async function runLine(ctx: Ctx, call: { sessionId: string; description: string }, line: string, options: LineOptions): Promise<LineRun> {
  const shell = await shellFor(ctx);
  const timeoutMs = callTimeout(options.timeoutMs);
  if (options.background !== true) return { ...(await runShell(shell, line, ctx.job.workspace.path, timeoutMs, ctx.job.signal)), signal: null, timeoutMs, jobId: null, ended: true };
  const started = Date.now();
  const run = await startProcess(ctx, call.sessionId, shell, { title: call.description, line });
  return { output: run.output, exitCode: run.exitCode, signal: run.signal, timedOut: false, leftoverStopped: false, durationMs: Date.now() - started, timeoutMs, jobId: run.jobId, ended: run.ended };
}

/** What a line's run returns to the model (plan 08 §8.3, ADR 0012, 7). */
export function lineRunText(run: LineRun): string {
  if (run.jobId !== null) {
    const output = run.output.replace(/[\r\n]+$/, '');
    const lines = output === '' ? [`started ${run.jobId}`] : [`started ${run.jobId}`, output];
    if (!run.ended) return [...lines, '[running]'].join('\n');
    if (run.exitCode !== null) return [...lines, '[the process has already ended]', `[exit code ${run.exitCode}]`].join('\n');
    if (run.signal !== null) return [...lines, '[the process has already ended]', `[killed by ${run.signal}]`].join('\n');
    return [...lines, '[the process has already ended]'].join('\n');
  }
  const timedOut = run.timedOut ? [`[timed out after ${Math.round(run.timeoutMs / 1000)} s; the process tree was killed]`] : [];
  const leftover = !run.timedOut && run.leftoverStopped ? ['[background processes were stopped when the command ended; set background to true to keep one running]'] : [];
  if (run.exitCode === null) throw new Error('A foreground run always has an exit code.');
  return resultLines(run.output, run.exitCode, [...timedOut, ...leftover]);
}

/** A run is an error when it exited non-zero, or was killed (ADR 0012, 7). */
export function lineRunIsError(run: LineRun): boolean {
  if (run.signal !== null) return true;
  return run.exitCode !== null && run.exitCode !== 0;
}

/** The options of the jobs that run a line: it may run for the call's longest timeout, with room to report it. */
export const lineRunOptions = { retries: 0, timeoutMs: 660_000 };

import { z, type Ctx } from '@kvman/sdk';
import { startProcess } from '../jobs/process-run.ts';
import { notFound } from '../problems.ts';
import { shellFor } from './shell-program.ts';
import { activeConnectors } from '../registry/register-connectors.ts';
import { resultLines } from '../result-text.ts';
import { payloads, shellCallInput } from '../schemas/payloads.ts';
import { binaryExec, builtinCommands } from './builtin-connectors.ts';
import { runShell } from './run-shell.ts';
import { callTimeout } from './shell-command.ts';

// The `shell` connector's `exec` and a binary connector's `exec` (plan 08 §8.3 and §8.4, ADR 0011, 2 and 5): one line in
// the real shell, in the workspace folder. It waits for the line, or with `background` starts it in the kernel's process
// service and returns its id.

const runSchema = z.object({
  output: z.string(),
  exitCode: z.number().int(),
  timedOut: z.boolean(),
  leftoverStopped: z.boolean(),
  durationMs: z.number(),
  timeoutMs: z.number().int(),
  jobId: z.string().nullable(),
  ended: z.boolean(),
});

/** What a line's run gave: its output and exit code, or for a background run its id and whether it has ended already. */
export type LineRun = z.output<typeof runSchema>;

/** Reads a shell command's job output. */
export const parseLineRun = (output: unknown): LineRun => runSchema.parse(output);

type LineOptions = { background?: boolean | undefined; timeoutMs?: number | undefined };

async function runLine(ctx: Ctx, call: { sessionId: string; description: string }, line: string, options: LineOptions): Promise<LineRun> {
  const shell = await shellFor(ctx);
  const timeoutMs = callTimeout(options.timeoutMs);
  if (options.background !== true) return { ...(await runShell(shell, line, ctx.job.workspace.path, timeoutMs, ctx.job.signal)), timeoutMs, jobId: null, ended: true };
  const started = Date.now();
  const run = await startProcess(ctx, call.sessionId, shell, { title: call.description, line });
  return { output: run.output, exitCode: 0, timedOut: false, leftoverStopped: false, durationMs: Date.now() - started, timeoutMs, jobId: run.jobId, ended: run.ended };
}

/** What a line's run returns to the model (plan 08 §8.3). */
export function lineRunText(run: LineRun): string {
  if (run.jobId !== null) {
    const ended = run.ended ? ['[the process has already ended; background output has its output]'] : [];
    return resultLines(`started ${run.jobId}${run.output === '' ? '' : `\n${run.output}`}`, 0, ended);
  }
  const timedOut = run.timedOut ? [`[timed out after ${Math.round(run.timeoutMs / 1000)} s; the process tree was killed]`] : [];
  const leftover = !run.timedOut && run.leftoverStopped ? ['[background processes were stopped when the command ended; set background to true to keep one running]'] : [];
  return resultLines(run.output, run.exitCode, [...timedOut, ...leftover]);
}

/** The options of both registrations: a line may run for the call's longest timeout, with room to report it. */
export const lineRunOptions = { retries: 0, timeoutMs: 660_000 };

export function registerShellConnector(ctx: Ctx): void {
  ctx.registerCommand('kvcoder.shell.run', {
    description: builtinCommands.shell.exec.description,
    input: shellCallInput(payloads.shellExec),
    output: runSchema,
    ...lineRunOptions,
    handle: ({ sessionId, description, payload }) => runLine(ctx, { sessionId, description }, payload.line, payload),
  });
  ctx.registerCommand('kvcoder.binary.run', {
    description: binaryExec.description,
    input: shellCallInput(payloads.binaryExec).extend({ connector: z.string().describe('The binary connector whose program runs.') }),
    output: runSchema,
    ...lineRunOptions,
    handle: async ({ sessionId, description, connector, payload }) => {
      const binary = (await activeConnectors(ctx)).find((candidate) => candidate.name === connector && candidate.kind === 'binary');
      if (binary === undefined) throw notFound(`There is no binary connector ${connector}.`, { connector });
      const args = payload.args?.trim() ?? '';
      return runLine(ctx, { sessionId, description }, args === '' ? connector : `${connector} ${args}`, payload);
    },
  });
}

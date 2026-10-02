import type { Ctx } from '@kvman/sdk';
import { startProcess } from '../jobs/process-run.ts';
import type { HeldResult } from '../schemas/records.ts';
import { runShell, shellDetails, shellResultText } from './run-shell.ts';
import type { ShellCommand } from './shell-command.ts';

// One approved or automatic shell call, sync or async (ADR 0009, 149): the result kvcoder holds for the model and the
// shell-result card.

export type ShellCall = { title?: string | undefined; description?: string | undefined; command: string; mode?: 'sync' | 'async' | undefined; timeoutMs: number };

export async function runShellCall(ctx: Ctx, sessionId: string, shell: ShellCommand, call: ShellCall): Promise<Pick<HeldResult, 'text' | 'details' | 'isError'>> {
  const started = Date.now();
  if (call.mode === 'async') {
    const run = await startProcess(ctx, sessionId, shell, { title: call.title ?? call.command, command: call.command });
    const exitCode = run.isError ? 1 : 0;
    const details = shellDetails(call, { output: run.output, exitCode, timedOut: false, backgroundStopped: false, durationMs: Date.now() - started });
    return { text: run.text, details: { ...details, mode: 'async', ...(run.jobId === '' ? {} : { jobId: run.jobId }) }, isError: run.isError };
  }
  const run = await runShell(shell, call.command, ctx.job.workspace.path, call.timeoutMs, ctx.job.signal);
  return { text: shellResultText(run, call.timeoutMs), details: shellDetails(call, run), isError: run.exitCode !== 0 };
}

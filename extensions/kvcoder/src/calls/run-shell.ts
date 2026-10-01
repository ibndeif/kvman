import { spawn } from 'node:child_process';
import { cutOutput, outputKept, outputLimit, resultLines } from '../connector-line.ts';
import { treeKill, type ShellCommand } from './shell-command.ts';

// One real shell call (plan 08 §8.3): in the workspace folder, with an empty stdin, stdout and stderr combined, and
// its process tree killed on timeout or cancel. It is a short-lived process of the step's job (plan 02 §2.6). Only the
// first and last 15 KB are kept once the output passes 30 KB.

export type ShellRun = { output: string; exitCode: number; timedOut: boolean; durationMs: number };

function killTree(pid: number | undefined): void {
  if (pid === undefined) return;
  const kill = treeKill(process.platform, pid);
  if (kill.kind === 'taskkill') {
    spawn(kill.program, kill.args, { stdio: 'ignore', windowsHide: true });
    return;
  }
  try {
    process.kill(-kill.pid, 'SIGKILL');
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ESRCH')) throw error;
  }
}

// Collects output, keeping everything up to the limit, then only the head and a rolling tail.
function outputCollector(): { add(chunk: Buffer): void; text(): string } {
  let all = Buffer.alloc(0);
  let tail = Buffer.alloc(0);
  let total = 0;
  return {
    add: (chunk) => {
      total += chunk.length;
      if (all.length <= outputLimit) all = Buffer.concat([all, chunk]);
      tail = Buffer.concat([tail, chunk]);
      if (tail.length > outputKept) tail = tail.subarray(tail.length - outputKept);
    },
    text: () => (total <= outputLimit ? all.toString('utf8') : cutOutput(all.subarray(0, outputKept), total - 2 * outputKept, tail)),
  };
}

export function runShell(shell: ShellCommand, command: string, cwd: string, timeoutMs: number, signal: AbortSignal): Promise<ShellRun> {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const child = spawn(shell.program, shell.args(command), { cwd, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32', windowsHide: true });
    const output = outputCollector();
    let timedOut = false;
    child.stdout.on('data', output.add);
    child.stderr.on('data', output.add);
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child.pid);
    }, timeoutMs);
    const abort = (): void => killTree(child.pid);
    signal.addEventListener('abort', abort, { once: true });
    const settle = (): void => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
    };
    child.once('error', (error) => {
      settle();
      reject(error);
    });
    child.once('close', (code, killedBy) => {
      settle();
      resolve({ output: output.text(), exitCode: timedOut ? 124 : (code ?? (killedBy === null ? 1 : 137)), timedOut, durationMs: Date.now() - started });
    });
  });
}

/** What a shell call returns to the model (ADR 0009, 93). */
export function shellResultText(run: ShellRun, timeoutMs: number): string {
  return resultLines(run.output, run.exitCode, run.timedOut ? [`[timed out after ${Math.round(timeoutMs / 1000)} s; the process tree was killed]`] : []);
}

/** The shell-result card's fields, kept in the toolResult's `details`. */
export function shellDetails(command: string, run: ShellRun): Record<string, string | number | boolean> {
  return { command, exitCode: run.exitCode, output: run.output, durationMs: run.durationMs, ...(run.timedOut ? { timedOut: true } : {}) };
}

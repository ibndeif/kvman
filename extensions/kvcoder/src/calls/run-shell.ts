import { spawn } from 'node:child_process';
import { cutOutput, outputKept, outputLimit, resultLines } from '../connector-line.ts';
import { treeKill, type ShellCommand } from './shell-command.ts';

// One real shell call (plan 08 §8.3): in the workspace folder, with an empty stdin, stdout and stderr combined, and
// its process tree killed on timeout or cancel. It is a short-lived process of the step's job (plan 02 §2.6). Only the
// first and last 15 KB are kept once the output passes 30 KB. The call ends when the shell exits, and what it left
// running in its group is killed (ADR 0009, 148).

export type ShellRun = { output: string; exitCode: number; timedOut: boolean; backgroundStopped: boolean; durationMs: number };

/** How long output gets to drain once the shell has exited, for a process outside its group that still holds the pipe. */
const drainMs = 1_000;

// Whether the group had any process left to signal.
function signalGroup(pid: number, signal: NodeJS.Signals): boolean {
  try {
    process.kill(-pid, signal);
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ESRCH') return false;
    throw error;
  }
}

function killTree(pid: number | undefined): void {
  if (pid === undefined) return;
  const kill = treeKill(process.platform, pid);
  if (kill.kind === 'taskkill') {
    spawn(kill.program, kill.args, { stdio: 'ignore', windowsHide: true });
    return;
  }
  signalGroup(kill.pid, 'SIGKILL');
}

// Once the shell has exited the group holds only what it left behind. Windows has no such group to find.
function stopBackground(pid: number | undefined): boolean {
  return pid !== undefined && process.platform !== 'win32' && signalGroup(pid, 'SIGKILL');
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
    let backgroundStopped = false;
    let drain: NodeJS.Timeout | undefined;
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
      clearTimeout(drain);
      signal.removeEventListener('abort', abort);
    };
    child.once('error', (error) => {
      settle();
      reject(error);
    });
    child.once('exit', () => {
      backgroundStopped = !timedOut && !signal.aborted && stopBackground(child.pid);
      drain = setTimeout(() => {
        child.stdout.destroy();
        child.stderr.destroy();
      }, drainMs);
    });
    child.once('close', (code, killedBy) => {
      settle();
      resolve({ output: output.text(), exitCode: timedOut ? 124 : (code ?? (killedBy === null ? 1 : 137)), timedOut, backgroundStopped, durationMs: Date.now() - started });
    });
  });
}

/** What a shell call returns to the model (ADR 0009, 93). */
export function shellResultText(run: ShellRun, timeoutMs: number): string {
  const notes = run.timedOut ? [`[timed out after ${Math.round(timeoutMs / 1000)} s; the process tree was killed]`] : run.backgroundStopped ? ['[background processes were stopped when the command ended]'] : [];
  return resultLines(run.output, run.exitCode, notes);
}

/** The shell-result card's fields, kept in the toolResult's `details`. */
export function shellDetails(call: { title?: string | undefined; description?: string | undefined; command: string }, run: ShellRun): Record<string, string | number | boolean> {
  return { ...(call.title === undefined ? {} : { title: call.title }), ...(call.description === undefined ? {} : { description: call.description }), command: call.command, exitCode: run.exitCode, output: run.output, durationMs: run.durationMs, ...(run.timedOut ? { timedOut: true } : {}) };
}

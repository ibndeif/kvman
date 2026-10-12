import { spawn } from 'node:child_process';
import { cutOutput, outputKept, outputLimit, plainEnvironment, plainText } from '../result-text.ts';
import { treeKill, type ShellCommand } from './shell-command.ts';

// One real shell call (plan 08 §8.3): in the workspace folder, with an empty stdin, stdout and stderr combined, and
// its process tree killed on timeout or cancel. It is a short-lived process of the step's job (plan 02 §2.6). Only the
// first and last 15 KB are kept once the output passes 30 KB. The call ends when the shell exits, and what it left
// running in its group is killed (ADR 0009, 148). Tools are asked for plain output, and terminal codes are removed
// from what is kept (ADR 0051, 1).

export type ShellRun = { output: string; exitCode: number; timedOut: boolean; leftoverStopped: boolean; durationMs: number };

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

/** Kills a process and everything it started: its group on Linux and macOS, `taskkill /T /F` on Windows. */
export function killTree(pid: number | undefined): void {
  if (pid === undefined) return;
  const kill = treeKill(process.platform, pid);
  if (kill.kind === 'taskkill') {
    spawn(kill.program, kill.args, { stdio: 'ignore', windowsHide: true });
    return;
  }
  signalGroup(kill.pid, 'SIGKILL');
}

// Once the shell has exited the group holds only what it left behind. Windows has no such group to find.
function stopLeftover(pid: number | undefined): boolean {
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
    text: () => plainText(total <= outputLimit ? all.toString('utf8') : cutOutput(all.subarray(0, outputKept), total - 2 * outputKept, tail)),
  };
}

export function runShell(shell: ShellCommand, line: string, cwd: string, timeoutMs: number, signal: AbortSignal): Promise<ShellRun> {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const program = shell.program;
    const args = shell.args(line);
    const options = { cwd, env: { ...process.env, ...plainEnvironment(process.env) }, stdio: ['ignore', 'pipe', 'pipe'] satisfies ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32', windowsHide: true };
    signal.throwIfAborted();
    const child = spawn(program, args, options);
    const output = outputCollector();
    let timedOut = false;
    let settled = false;
    let stopRequested = false;
    let leftoverStopped = false;
    let drain: NodeJS.Timeout | undefined;
    child.stdout.on('data', output.add);
    child.stderr.on('data', output.add);
    const abort = (): void => {
      if (settled || stopRequested) return;
      stopRequested = true;
      killTree(child.pid);
    };
    const timer = setTimeout(() => {
      timedOut = true;
      abort();
    }, timeoutMs);
    const settle = (): boolean => {
      if (settled) return false;
      settled = true;
      clearTimeout(timer);
      clearTimeout(drain);
      signal.removeEventListener('abort', abort);
      return true;
    };
    child.once('error', (error) => {
      // An error with a pid does not confirm a cancelled child's shutdown; wait for close.
      if (signal.aborted && child.pid !== undefined) return;
      if (!settle()) return;
      reject(signal.aborted ? signal.reason : error);
    });
    child.once('exit', () => {
      if (settled) return;
      stopRequested = true;
      leftoverStopped = !timedOut && !signal.aborted && stopLeftover(child.pid);
      drain = setTimeout(() => {
        child.stdout.destroy();
        child.stderr.destroy();
      }, drainMs);
    });
    child.once('close', (code, killedBy) => {
      if (!settle()) return;
      if (signal.aborted) { reject(signal.reason); return; }
      resolve({ output: output.text(), exitCode: timedOut ? 124 : (code ?? (killedBy === null ? 1 : 137)), timedOut, leftoverStopped, durationMs: Date.now() - started });
    });
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
}

import type { SpawnOptions } from 'node:child_process';
import spawn from 'cross-spawn';
import { killTree } from '../calls/run-shell.ts';
import type { Platform } from '../calls/shell-command.ts';
import { outputLimit } from '../result-text.ts';
import type { CommandLine, ProgramEnd } from './programs.ts';

// One run of a program worker (plan 08 §8.5, ADR 0021, 11 and 26): in the workspace folder, with kvman's environment
// and an empty standard input, in its own process group on Linux and macOS so its whole tree can be killed, which
// happens at its time limit and on cancel. It is a process of the run's own job (plan 02 §2.6).

/** How the program is started on each OS: Windows has no process group, and its tree is killed by `taskkill`. */
export function programSpawn(platform: Platform, cwd: string, env: NodeJS.ProcessEnv): SpawnOptions {
  return { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], detached: platform !== 'win32', windowsHide: true };
}

/** The most of each stream that is kept: enough for an answer, which is then cut for the model. */
const keptBytes = 4 * outputLimit;

// Keeps the end of a stream: an answer comes last.
function tail(): { add(chunk: Buffer): void; text(): string } {
  let kept = Buffer.alloc(0);
  return {
    add: (chunk) => {
      kept = Buffer.concat([kept, chunk]);
      if (kept.length > keptBytes) kept = kept.subarray(kept.length - keptBytes);
    },
    text: () => kept.toString('utf8'),
  };
}

const checkTimeoutMs = 5_000;

/** Whether a program is installed: started as a run starts it, it exits 0 within 5 s (ADR 0021, 37). */
export async function programFound(line: CommandLine, cwd: string, signal: AbortSignal): Promise<boolean> {
  const end = await runProgram(line, cwd, checkTimeoutMs, signal);
  return end.startError === null && !end.timedOut && end.exitCode === 0;
}

export function runProgram(line: CommandLine, cwd: string, timeoutMs: number, signal: AbortSignal): Promise<ProgramEnd> {
  return new Promise((resolve) => {
    const child = spawn(line.command, line.args, programSpawn(process.platform, cwd, process.env));
    const stdout = tail();
    const stderr = tail();
    let timedOut = false;
    child.stdout?.on('data', stdout.add);
    child.stderr?.on('data', stderr.add);
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child.pid);
    }, timeoutMs);
    const abort = (): void => killTree(child.pid);
    signal.addEventListener('abort', abort, { once: true });
    let settled = false;
    // A program that can't start reports an error and may then close as well.
    const settle = (end: Pick<ProgramEnd, 'exitCode' | 'startError'>): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      resolve({ stdout: stdout.text(), stderr: stderr.text(), timedOut, ...end });
    };
    child.once('error', (error) => settle({ exitCode: null, startError: error.message }));
    child.once('close', (code) => settle({ exitCode: code, startError: null }));
  });
}

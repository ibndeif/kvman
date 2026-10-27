import { spawn } from 'node:child_process';
import { kvvideoProblem } from '../problems.ts';
import { programSetting, type ProgramName } from '../settings.ts';
import { killTree, startsOwnGroup } from './kill-tree.ts';

// One run of ffmpeg, ffprobe, or Piper inside its job (plan 16 §16.3): an empty stdin, its stdout kept apart and
// both streams together, and its tree killed when the job is cancelled or the run passes its own time limit. A
// program that can't be started fails `kvvideo/PROGRAM_MISSING`.

/** A finished run. */
export type ProgramRun = { exitCode: number; stdout: string; output: string; timedOut: boolean };

/** How one program runs: the program kvvideo calls it, and where its executable is. */
export type Program = { name: ProgramName; command: string };

export type RunOptions = { signal: AbortSignal; cwd?: string; timeoutMs?: number };

const notStarted = new Set(['ENOENT', 'EACCES', 'ENOTDIR']);

function missing(program: Program): Error {
  return kvvideoProblem('PROGRAM_MISSING', `${program.name} can't be started (${program.command}); install it or set ${programSetting(program.name)}.`, { program: program.name, setting: programSetting(program.name) });
}

export function runProgram(program: Program, args: readonly string[], options: RunOptions): Promise<ProgramRun> {
  return new Promise((resolve, reject) => {
    const child = spawn(program.command, args, { cwd: options.cwd, stdio: ['ignore', 'pipe', 'pipe'], detached: startsOwnGroup(process.platform), windowsHide: true });
    let stdout = '';
    let output = '';
    let timedOut = false;
    child.stdout.setEncoding('utf8').on('data', (text: string) => {
      stdout += text;
      output += text;
    });
    child.stderr.setEncoding('utf8').on('data', (text: string) => (output += text));
    const abort = (): void => killTree(child.pid);
    const timer = options.timeoutMs === undefined ? undefined : setTimeout(() => {
      timedOut = true;
      abort();
    }, options.timeoutMs);
    const settle = (): void => {
      clearTimeout(timer);
      options.signal.removeEventListener('abort', abort);
    };
    options.signal.addEventListener('abort', abort, { once: true });
    if (options.signal.aborted) abort();
    child.once('error', (error) => {
      settle();
      reject('code' in error && typeof error.code === 'string' && notStarted.has(error.code) ? missing(program) : error);
    });
    child.once('close', (code) => {
      settle();
      resolve({ exitCode: code ?? 1, stdout, output, timedOut });
    });
  });
}

/** The last lines of a run's output, for a Problem's reason. */
export function lastLines(output: string, count = 20): string {
  return output.trimEnd().split('\n').slice(-count).join('\n');
}

import { spawn } from 'node:child_process';
import { kvvideoProblem } from '../problems.ts';
import { programSetting } from '../settings.ts';
import { killTree, startsOwnGroup } from './kill-tree.ts';
import type { Program, ProgramRun } from './run-program.ts';

// A program fed through its stdin while it runs (plan 16 §16.5): ffmpeg encoding a recording's frames as they come.
// A write waits until the program has taken it. A program that stops reading takes no more writes; its exit code
// and output then say why, and `end` answers them. Its tree is killed when the signal aborts.

export type PipedProgram = { write(chunk: Buffer): Promise<void>; end(): Promise<ProgramRun> };

const notStarted = new Set(['ENOENT', 'EACCES', 'ENOTDIR']);

export function startPiped(program: Program, args: readonly string[], signal: AbortSignal): Promise<PipedProgram> {
  return new Promise((resolve, reject) => {
    const child = spawn(program.command, args, { stdio: ['pipe', 'pipe', 'pipe'], detached: startsOwnGroup(process.platform), windowsHide: true });
    let stdout = '';
    let output = '';
    let pipeError: Error | undefined;
    child.stdout.setEncoding('utf8').on('data', (text: string) => {
      stdout += text;
      output += text;
    });
    child.stderr.setEncoding('utf8').on('data', (text: string) => (output += text));
    child.stdin.on('error', (error) => (pipeError = error));
    const abort = (): void => killTree(child.pid);
    signal.addEventListener('abort', abort, { once: true });
    const closed = new Promise<number>((settle) => child.once('close', (code) => settle(code ?? 1)));
    child.once('error', (error) => {
      signal.removeEventListener('abort', abort);
      const missing = 'code' in error && typeof error.code === 'string' && notStarted.has(error.code);
      reject(missing ? kvvideoProblem('PROGRAM_MISSING', `${program.name} can't be started (${program.command}); install it or set ${programSetting(program.name)}.`, { program: program.name, setting: programSetting(program.name) }) : error);
    });
    child.once('spawn', () => {
      resolve({
        write: (chunk) =>
          new Promise((done) => {
            if (pipeError !== undefined || child.stdin.destroyed) return done();
            child.stdin.write(chunk, () => done());
          }),
        end: async () => {
          child.stdin.end();
          const exitCode = await closed;
          signal.removeEventListener('abort', abort);
          if (exitCode === 0 && pipeError !== undefined) throw pipeError;
          return { exitCode, stdout, output, timedOut: false };
        },
      });
    });
  });
}

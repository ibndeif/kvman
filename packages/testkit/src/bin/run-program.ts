import { spawn } from 'node:child_process';
import { BinFailure } from './bin-failure.ts';
import { programCommand, type Program } from './program-command.ts';

// One npm or npx run inside a testkit bin: stdin empty, its stdout kept apart and stdout and stderr together.
// npm missing from the PATH fails `NPM_FAILED`.

export type ProgramRun = { exitCode: number; stdout: string; output: string };

export function runProgram(program: Program, args: readonly string[], cwd: string): Promise<ProgramRun> {
  const start = programCommand(process.platform, program, args);
  return new Promise((resolve, reject) => {
    const child = spawn(start.command, start.args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], detached: start.detached, windowsHide: true });
    let stdout = '';
    let output = '';
    child.stdout?.setEncoding('utf8').on('data', (text: string) => {
      stdout += text;
      output += text;
    });
    child.stderr?.setEncoding('utf8').on('data', (text: string) => {
      output += text;
    });
    child.once('error', (error) => {
      const missing = 'code' in error && error.code === 'ENOENT';
      reject(missing ? new BinFailure('NPM_FAILED', `${program} isn't on the PATH; install Node.js with npm.`, { program }) : error);
    });
    child.once('close', (code) => {
      resolve({ exitCode: code ?? 1, stdout, output });
    });
  });
}

/** The last lines of a run's output, for a failure's message. */
export function lastLines(output: string, count = 20): string {
  return output.trimEnd().split('\n').slice(-count).join('\n');
}

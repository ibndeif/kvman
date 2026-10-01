import { spawn } from 'node:child_process';
import { kvdevProblem } from './problems.ts';
import { programCommand, treeKill, type Program } from './program-command.ts';

// One npm or npx run inside a kvdev job (plan 02 §2.16: short-lived processes stay in their job): stdin empty, its
// stdout kept apart and stdout and stderr together, and its tree killed when the job is cancelled. npm missing from
// the PATH fails `kvdev/NPM_FAILED` (ADR 0009, 126).

export type ProgramRun = { exitCode: number; stdout: string; output: string };

function killTree(pid: number | undefined): void {
  if (pid === undefined) return;
  const kill = treeKill(process.platform, pid);
  if (kill.kind === 'taskkill') {
    spawn(kill.command, kill.args, { stdio: 'ignore', windowsHide: true });
    return;
  }
  try {
    process.kill(-kill.pid, 'SIGKILL');
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ESRCH')) throw error;
  }
}

export function runProgram(program: Program, args: readonly string[], cwd: string, signal: AbortSignal): Promise<ProgramRun> {
  const start = programCommand(process.platform, program, args);
  return new Promise((resolve, reject) => {
    const child = spawn(start.command, start.args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], detached: start.detached, windowsHide: true });
    let stdout = '';
    let output = '';
    child.stdout.setEncoding('utf8').on('data', (text: string) => {
      stdout += text;
      output += text;
    });
    child.stderr.setEncoding('utf8').on('data', (text: string) => (output += text));
    const abort = (): void => killTree(child.pid);
    signal.addEventListener('abort', abort, { once: true });
    child.once('error', (error) => {
      signal.removeEventListener('abort', abort);
      const missing = 'code' in error && error.code === 'ENOENT';
      reject(missing ? kvdevProblem('NPM_FAILED', `${program} isn't on the PATH; install Node.js with npm.`, { program }) : error);
    });
    child.once('close', (code) => {
      signal.removeEventListener('abort', abort);
      resolve({ exitCode: code ?? 1, stdout, output });
    });
  });
}

/** The last lines of a run's output, for a Problem's message. */
export function lastLines(output: string, count = 20): string {
  return output.trimEnd().split('\n').slice(-count).join('\n');
}

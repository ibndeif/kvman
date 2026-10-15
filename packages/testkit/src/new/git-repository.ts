import { spawn } from 'node:child_process';
import { BinFailure } from '../bin/bin-failure.ts';
import { lastLines } from '../bin/run-program.ts';

// A new project's Git repository (plan 10, ADR 0082, 16): `git init` with no commit, when Git is on the PATH and the
// folder isn't already inside a work tree. Git runs directly on every OS, since it is an executable on Windows too.

type GitRun = { exitCode: number; output: string } | 'missing';

function runGit(args: readonly string[], cwd: string): Promise<GitRun> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let output = '';
    child.stdout?.setEncoding('utf8').on('data', (text: string) => (output += text));
    child.stderr?.setEncoding('utf8').on('data', (text: string) => (output += text));
    child.once('error', (error) => (('code' in error && error.code === 'ENOENT') ? resolve('missing') : reject(error)));
    child.once('close', (code) => resolve({ exitCode: code ?? 1, output }));
  });
}

/** Starts a repository in `folder`, unless Git is missing or the folder is inside a work tree; a failed init fails `GIT_FAILED`. */
export async function startRepository(folder: string): Promise<void> {
  const inside = await runGit(['rev-parse', '--is-inside-work-tree'], folder);
  if (inside === 'missing' || (inside.exitCode === 0 && inside.output.trim() === 'true')) return;
  const init = await runGit(['init', '--quiet'], folder);
  if (init === 'missing') return;
  if (init.exitCode !== 0) {
    throw new BinFailure('GIT_FAILED', `git init failed in ${folder} (exit code ${String(init.exitCode)}):\n${lastLines(init.output)}`, { folder, exitCode: init.exitCode });
  }
}

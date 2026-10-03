import { spawn } from 'node:child_process';
import path from 'node:path';
import { repositoryRoot } from './npm-mirror.ts';

// Runs a built testkit bin as a child process, without a shell: `node <repo>/packages/testkit/dist/<bin> …args`. The
// bins are built by the global setup. Resolves how the bin ended; the test timeout covers a slow run.

/** How a built bin ended: its exit code with its whole stdout and stderr. */
export type BinRun = { exitCode: number; stdout: string; stderr: string };

/** Runs the built bin at `bin` (such as `new/new-bin.js`) with `args` in `cwd` and `env` over `process.env`. */
export function runBin(bin: string, args: readonly string[], options: { cwd: string; env?: Record<string, string | undefined> }): Promise<BinRun> {
  const binFile = path.join(repositoryRoot, 'packages/testkit/dist', bin);
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [binFile, ...args], { cwd: options.cwd, env: { ...process.env, ...options.env }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout?.setEncoding('utf8').on('data', (text: string) => {
      stdout += text;
    });
    child.stderr?.setEncoding('utf8').on('data', (text: string) => {
      stderr += text;
    });
    child.once('error', reject);
    child.once('close', (code) => {
      resolve({ exitCode: code ?? 1, stdout, stderr });
    });
  });
}

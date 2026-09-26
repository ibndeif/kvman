import { spawn } from 'node:child_process';

export type ToolRun = { command: string; args: readonly string[]; cwd: string; env: NodeJS.ProcessEnv; signal: AbortSignal };

export type ToolOutput = { stdout: string; stderr: string };

// A tool that exited with a failure; `stderr` is its last output, for the problem's detail.
export class ToolFailed extends Error {
  readonly stderr: string;

  constructor(command: string, code: number | null, stderr: string) {
    super(`${command} exited with ${code ?? 'a signal'}`);
    this.name = 'ToolFailed';
    this.stderr = stderr;
  }
}

const outputLimit = 64 * 1024;

function keepTail(current: string, chunk: string): string {
  const next = current + chunk;
  return next.length > outputLimit ? next.slice(next.length - outputLimit) : next;
}

// Runs pnpm or git in its own process group, so an abort (the fetch time limit, a shutdown) kills it with everything
// it started (ADR 0118).
export function runTool(run: ToolRun): Promise<ToolOutput> {
  return new Promise((done, fail) => {
    if (run.signal.aborted) {
      fail(run.signal.reason);
      return;
    }
    const child = spawn(run.command, run.args, { cwd: run.cwd, env: run.env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const kill = (): void => {
      if (child.pid !== undefined && child.exitCode === null) process.kill(-child.pid, 'SIGKILL');
    };
    run.signal.addEventListener('abort', kill, { once: true });
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => { stdout = keepTail(stdout, chunk); });
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => { stderr = keepTail(stderr, chunk); });
    child.on('error', (error) => {
      run.signal.removeEventListener('abort', kill);
      fail(error);
    });
    child.on('close', (code) => {
      run.signal.removeEventListener('abort', kill);
      if (run.signal.aborted) fail(run.signal.reason);
      else if (code === 0) done({ stdout, stderr });
      else fail(new ToolFailed(run.command, code, stderr || stdout));
    });
  });
}

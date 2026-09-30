import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { Sandbox } from './sandbox.ts';

// kvman as a child process, run from its TypeScript source (plan 12 §12.1). Its HOME (USERPROFILE on Windows) is the
// sandbox's user folder, and stdin is a pipe, so it never has a terminal.

const mainFile = fileURLToPath(new URL('../../src/main.ts', import.meta.url));
const urlPattern = /http:\/\/127\.0\.0\.1:(\d+)\/\?workspace=(\S+)/;

export type ChildOptions = { cwd?: string; env?: Record<string, string>; defaults?: boolean };

export type KvmanChild = {
  process: ChildProcess;
  output(): string;
  errors(): string;
  // Resolves to the exit code, or to the signal's name when a signal ended it.
  exit: Promise<number | string>;
};

export type RunningKvman = KvmanChild & { url: string; port: number; workspaceId: string };

// `--home`, `--port 0`, `--no-open`, and `--yes`, unless `defaults` is false.
export function defaultArguments(sandbox: Sandbox): string[] {
  return ['--home', sandbox.home, '--port', '0', '--no-open', '--yes'];
}

export function spawnKvman(sandbox: Sandbox, args: readonly string[], options: ChildOptions = {}): KvmanChild {
  const env: NodeJS.ProcessEnv = { ...process.env, HOME: sandbox.user, USERPROFILE: sandbox.user, ...options.env };
  delete env['KVMAN_HOME'];
  const allArgs = options.defaults === false ? [...args] : [...defaultArguments(sandbox), ...args];
  const child = spawn(process.execPath, ['--conditions=@kvman/source', mainFile, ...allArgs], { cwd: options.cwd ?? sandbox.start, env, stdio: 'pipe' });
  let output = '';
  let errors = '';
  child.stdout.setEncoding('utf8').on('data', (text: string) => (output += text));
  child.stderr.setEncoding('utf8').on('data', (text: string) => (errors += text));
  const exit = new Promise<number | string>((resolve) => child.once('exit', (code, signal) => resolve(code ?? signal ?? 'unknown')));
  sandbox.track(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await exit;
  });
  return { process: child, output: () => output, errors: () => errors, exit };
}

function failedStart(child: KvmanChild, ended: number | string): Error {
  return new Error(`kvman ended (${String(ended)}) before printing its URL.\nstdout:\n${child.output()}\nstderr:\n${child.errors()}`);
}

// Resolves once kvman prints its URL.
export function whenListening(child: KvmanChild): Promise<RunningKvman> {
  return new Promise((resolve, reject) => {
    const check = (): void => {
      const match = urlPattern.exec(child.output());
      if (match === null) return;
      child.process.stdout?.off('data', check);
      resolve({ ...child, url: match[0], port: Number(match[1]), workspaceId: decodeURIComponent(match[2] ?? '') });
    };
    child.process.stdout?.on('data', check);
    check();
    void child.exit.then((ended) => reject(failedStart(child, ended)));
  });
}

export async function startKvman(sandbox: Sandbox, args: readonly string[], options: ChildOptions = {}): Promise<RunningKvman> {
  return whenListening(spawnKvman(sandbox, args, options));
}

// Runs kvman until it exits.
export async function runKvman(sandbox: Sandbox, args: readonly string[], options: ChildOptions = {}): Promise<{ code: number | string; output: string; errors: string }> {
  const child = spawnKvman(sandbox, args, options);
  const code = await child.exit;
  return { code, output: child.output(), errors: child.errors() };
}

// Sends a signal and resolves to the exit code.
export async function stopKvman(child: KvmanChild, signal: NodeJS.Signals = 'SIGINT'): Promise<number | string> {
  child.process.kill(signal);
  return child.exit;
}

import { execFile, spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { promisify } from 'node:util';
import { layoutOf, type Target } from './runtime-plan.ts';

// The run of the bundle with no window (plan 14 §14.8): the bundled Node starts the bundled kvman with `--pipe` on a
// new home, with no other Node on its `PATH`. It must write its `running` line, answer `kernel.health.get`, find the
// bundled npm, and exit 0 once its input closes.

export type TryOptions = {
  runtime: string;
  target: Target;
  // The `PATH` kvman gets before the bundled Node's folder; the release gives the system's own folders, with no Node.
  systemPath: string;
  environment?: Record<string, string>;
  waitMs?: number;
};

export type Tried = { port: number; npmVersion: string };

type Running = { kind: 'running'; port: number };

function isRunning(value: unknown): value is Running {
  return typeof value === 'object' && value !== null && 'kind' in value && value.kind === 'running' && 'port' in value && typeof value.port === 'number';
}

function within<Value>(work: Promise<Value>, waitMs: number, failure: string): Promise<Value> {
  return Promise.race([
    work,
    new Promise<never>((_resolve, reject) => {
      AbortSignal.timeout(waitMs).addEventListener('abort', () => reject(new Error(failure)));
    }),
  ]);
}

async function health(port: number): Promise<void> {
  const failure = `kernel.health.get did not answer on port ${String(port)}.`;
  const response = await fetch(`http://127.0.0.1:${String(port)}/api/queries/kernel.health.get`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ input: {} }),
  }).catch(() => {
    throw new Error(failure);
  });
  const answer: unknown = await response.json();
  if (typeof answer !== 'object' || answer === null || !('ok' in answer) || answer.ok !== true) throw new Error(failure);
}

export async function tryRuntime(options: TryOptions): Promise<Tried> {
  const layout = layoutOf(options.target);
  const inside = (file: string): string => path.join(options.runtime, ...file.split('/'));
  const waitMs = options.waitMs ?? 60_000;
  const home = mkdtempSync(path.join(tmpdir(), 'kvman-try-runtime-'));
  const env: NodeJS.ProcessEnv = { ...process.env, ...options.environment, PATH: `${options.systemPath}${path.delimiter}${inside(layout.nodeFolder)}` };
  delete env['KVMAN_HOME'];
  const kvman = spawn(inside(layout.node), [inside(layout.entry), '--pipe', '--yes', '--no-open', '--port', '0', '--home', home], { cwd: home, env, stdio: ['pipe', 'pipe', 'inherit'] });
  const exited = new Promise<number | null>((resolve) => kvman.once('exit', (code) => resolve(code)));
  try {
    const lines = createInterface({ input: kvman.stdout });
    const first = new Promise<string | undefined>((resolve) => {
      lines.once('line', resolve);
      lines.once('close', () => resolve(undefined));
    });
    const line = await within(first, waitMs, 'kvman wrote no running line.');
    const running: unknown = line === undefined ? undefined : JSON.parse(line);
    if (!isRunning(running)) throw new Error(`kvman wrote no running line${line === undefined ? '' : `, but ${line}`}.`);
    await health(running.port);
    const npm = await promisify(execFile)(options.target.startsWith('win') ? 'npm.cmd' : 'npm', ['--version'], { env, shell: options.target.startsWith('win') });
    const bundled = (JSON.parse(readFileSync(path.join(inside(layout.npmPackage), 'package.json'), 'utf8')) as { version: string }).version;
    if (npm.stdout.trim() !== bundled) throw new Error(`npm on kvman's PATH is ${npm.stdout.trim()}, not the bundled ${bundled}.`);
    kvman.stdin.end();
    const code = await within(exited, waitMs, 'kvman did not exit after its input closed.');
    if (code !== 0) throw new Error(`kvman exited ${String(code)} after its input closed, not 0.`);
    return { port: running.port, npmVersion: bundled };
  } finally {
    if (kvman.exitCode === null && kvman.signalCode === null) kvman.kill('SIGKILL');
    await exited;
    rmSync(home, { recursive: true, force: true });
  }
}

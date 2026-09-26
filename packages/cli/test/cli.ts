import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { daemonLockSchema, healthResultSchema, type DaemonLock, type HealthResult } from '@kvman/protocol';

// The kvman command run as a person runs it, from the sources (the daemon it starts is a real kernel process).
const main = fileURLToPath(new URL('../src/main.ts', import.meta.url));

export const daemonTests = { timeout: 60_000 } as const;

export type Run = { code: number; stdout: string; stderr: string };

export type Invocation = { env?: NodeJS.ProcessEnv; cwd?: string };

export function temporaryFolder(): string {
  return mkdtempSync(join(tmpdir(), 'kvman-cli-'));
}

// The daemons these tests start run their first run in their own user folder, so the Home workspace (~/kvman,
// ADR 0127) is never created in the real one.
const userFolder = temporaryFolder();

function environment(extra: NodeJS.ProcessEnv | undefined): NodeJS.ProcessEnv {
  const { KVMAN_HOME: _inherited, ...rest } = process.env;
  return { ...rest, HOME: userFolder, ...extra };
}

export function kvman(args: readonly string[], invocation: Invocation = {}): Promise<Run> {
  return new Promise((resolve) => {
    execFile(process.execPath, ['--conditions=@kvman/source', main, ...args], { env: environment(invocation.env), cwd: invocation.cwd }, (error, stdout, stderr) => {
      const code = error === null ? 0 : typeof error.code === 'number' ? error.code : 1;
      resolve({ code, stdout, stderr });
    });
  });
}

export function spawnKvman(args: readonly string[]): ChildProcess {
  return spawn(process.execPath, ['--conditions=@kvman/source', main, ...args], { env: environment(undefined), stdio: ['ignore', 'pipe', 'pipe'] });
}

export function lockOf(home: string): DaemonLock {
  return daemonLockSchema.parse(JSON.parse(readFileSync(join(home, 'daemon.lock'), 'utf8')));
}

export async function healthOf(port: number, headers: Record<string, string> = {}): Promise<HealthResult> {
  const response = await fetch(`http://127.0.0.1:${port}/api/v1/health`, { headers });
  return healthResultSchema.parse(await response.json());
}

export function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ESRCH') return false;
    throw error;
  }
}

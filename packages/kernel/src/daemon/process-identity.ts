import { execFile, execFileSync } from 'node:child_process';

function exitStatus(error: unknown): number | undefined {
  return error instanceof Error && 'status' in error && typeof error.status === 'number' ? error.status : undefined;
}

// ADR 0088: a process's start time as `ps -o lstart=` prints it in the C locale, the same command on Linux and
// macOS; `undefined` when no process has this PID (ps exits 1).
export function processStartOf(pid: number): string | undefined {
  try {
    const output = execFileSync('ps', ['-o', 'lstart=', '-p', String(pid)], {
      encoding: 'utf8', env: { ...process.env, LC_ALL: 'C' }, stdio: ['ignore', 'pipe', 'ignore'],
    });
    const start = output.trim().replace(/\s+/g, ' ');
    return start.length > 0 ? start : undefined;
  } catch (error) {
    if (exitStatus(error) === 1) return undefined;
    throw error;
  }
}

// The same, without blocking the main thread: the process supervisor reads it for every process it starts (ADR 0139).
export function readProcessStart(pid: number): Promise<string | undefined> {
  return new Promise((resolve, reject) => {
    execFile('ps', ['-o', 'lstart=', '-p', String(pid)], { encoding: 'utf8', env: { ...process.env, LC_ALL: 'C' } }, (error, output) => {
      if (error !== null) {
        if (error.code === 1) resolve(undefined);
        else reject(error);
        return;
      }
      const start = output.trim().replace(/\s+/g, ' ');
      resolve(start.length > 0 ? start : undefined);
    });
  });
}

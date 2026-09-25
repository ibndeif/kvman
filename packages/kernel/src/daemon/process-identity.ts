import { execFileSync } from 'node:child_process';

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

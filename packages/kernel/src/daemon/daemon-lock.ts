import { linkSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { daemonLockSchema, type DaemonLock } from '@kvman/protocol';
import { kernelProblem, ProblemError } from '../problems.ts';
import { processStartOf } from './process-identity.ts';

const lockFileMode = 0o600;

// Each attempt either creates the lock, meets a live owner, or removes a stale lock; only starts racing on one home
// folder need more than two.
const lockAttempts = 8;

// Every step that could leave a file behind works inside logs/, the one folder a home may hold before kvman.db
// exists (R-Q4), so an interrupted start never makes its home invalid.
function workFile(home: string, name: string): string {
  mkdirSync(join(home, 'logs'), { recursive: true, mode: 0o700 });
  return join(home, 'logs', name);
}

function lockPath(home: string): string {
  return join(home, 'daemon.lock');
}

function errorCode(error: unknown): string | undefined {
  return error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : undefined;
}

function readText(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf8');
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return undefined;
    throw error;
  }
}

export function readDaemonLock(home: string): DaemonLock | undefined {
  const text = readText(lockPath(home));
  if (text === undefined) return undefined;
  try {
    const parsed = daemonLockSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : undefined;
  } catch (error) {
    if (error instanceof SyntaxError) return undefined;
    throw error;
  }
}

function linkExclusively(home: string, record: DaemonLock): boolean {
  const pending = workFile(home, `daemon.lock.${record.nonce}`);
  writeFileSync(pending, JSON.stringify(record), { mode: lockFileMode });
  try {
    linkSync(pending, lockPath(home));
    return true;
  } catch (error) {
    if (errorCode(error) === 'EEXIST') return false;
    throw error;
  } finally {
    rmSync(pending, { force: true });
  }
}

// The stale lock is moved aside before it is deleted, so a lock another start created meanwhile is put back instead.
function takeOver(home: string, staleText: string, nonce: string): void {
  const aside = workFile(home, `daemon.lock.stale.${nonce}`);
  try {
    renameSync(lockPath(home), aside);
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return;
    throw error;
  }
  if (readText(aside) !== staleText) {
    try {
      linkSync(aside, lockPath(home));
    } catch (error) {
      if (errorCode(error) !== 'EEXIST') throw error;
    }
  }
  rmSync(aside, { force: true });
}

// 03 §3.10, ADR 0088: the lock is created atomically (0600). A live owner (its PID alive with the same start time) is
// a conflict whether or not it answers yet; any other lock is stale and taken over.
export function acquireDaemonLock(home: string, record: DaemonLock, correlationId: string): void {
  const conflict = (detail: string): ProblemError => new ProblemError(kernelProblem('DAEMON_CONFLICT', { correlationId, detail }));
  for (let attempt = 0; attempt < lockAttempts; attempt += 1) {
    if (linkExclusively(home, record)) return;
    const staleText = readText(lockPath(home));
    if (staleText === undefined) continue;
    const owner = readDaemonLock(home);
    if (owner !== undefined && processStartOf(owner.pid) === owner.processStart) {
      throw conflict(`the kernel with process ${owner.pid} owns ${home} on port ${owner.port}`);
    }
    takeOver(home, staleText, record.nonce);
  }
  throw conflict(`other kernels kept replacing the lock of ${home}`);
}

// Release removes the lock only while it is still this kernel's.
export function releaseDaemonLock(home: string, nonce: string): void {
  if (readDaemonLock(home)?.nonce === nonce) rmSync(lockPath(home), { force: true });
}

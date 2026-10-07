import { linkSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { z } from '@kvman/sdk';

// `kvman.lock` (plan 01 §1.3, ADR 0009, 43): `{ pid }` from start, `{ pid, port }` once kvman listens. A lock is only
// ever put in place whole, by hard-linking a finished file (which fails when a lock exists). A stale lock is moved
// aside before it's removed; if what was moved turns out to be another kvman's fresh lock, it's put back, so two kvmen
// replacing one stale lock can't both take it.

const lockSchema = z.object({ pid: z.number().int().positive(), port: z.number().int().min(1).max(65_535).optional() });

export type Lock = z.infer<typeof lockSchema>;

export type TakenLock = { kind: 'taken'; setPort(port: number): void; release(): void };

export type LockTaking = TakenLock | { kind: 'held'; lock: Lock };

function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code;
}

export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (hasCode(error, 'ESRCH')) return false;
    if (hasCode(error, 'EPERM')) return true;
    throw error;
  }
}

function readLock(file: string): { text: string; lock: Lock | undefined } | undefined {
  try {
    const text = readFileSync(file, 'utf8');
    const result = lockSchema.safeParse(JSON.parse(text));
    return { text, lock: result.success ? result.data : undefined };
  } catch (error) {
    if (hasCode(error, 'ENOENT')) return undefined;
    if (error instanceof SyntaxError) return { text: '', lock: undefined };
    throw error;
  }
}

// Writes a finished file beside the lock and links it into place; false when a lock is already there.
function placeLock(file: string, lock: Lock): boolean {
  const draft = `${file}.${String(process.pid)}.draft`;
  writeFileSync(draft, JSON.stringify(lock));
  try {
    linkSync(draft, file);
    return true;
  } catch (error) {
    if (hasCode(error, 'EEXIST')) return false;
    throw error;
  } finally {
    rmSync(draft, { force: true });
  }
}

function removeStale(file: string, staleText: string): void {
  const aside = `${file}.${String(process.pid)}.stale`;
  try {
    renameSync(file, aside);
  } catch (error) {
    if (hasCode(error, 'ENOENT')) return;
    throw error;
  }
  if (readFileSync(aside, 'utf8') !== staleText) {
    try {
      linkSync(aside, file);
    } catch (error) {
      if (!hasCode(error, 'EEXIST')) throw error;
    }
  }
  rmSync(aside, { force: true });
}

/** The home's lock when a live process holds it: the kvman that runs on that home. */
export function liveLock(home: string, alive: (pid: number) => boolean = isAlive): Lock | undefined {
  const found = readLock(path.join(home, 'kvman.lock'));
  return found?.lock !== undefined && alive(found.lock.pid) ? found.lock : undefined;
}

function taken(file: string, pid: number): TakenLock {
  return {
    kind: 'taken',
    setPort: (port) => {
      const draft = `${file}.${String(pid)}.draft`;
      writeFileSync(draft, JSON.stringify({ pid, port }));
      renameSync(draft, file);
    },
    release: () => {
      if (readLock(file)?.lock?.pid === pid) rmSync(file, { force: true });
    },
  };
}

export function takeLock(home: string, pid: number = process.pid, alive: (pid: number) => boolean = isAlive): LockTaking {
  mkdirSync(home, { recursive: true });
  const file = path.join(home, 'kvman.lock');
  for (;;) {
    if (placeLock(file, { pid })) return taken(file, pid);
    const found = readLock(file);
    if (found === undefined) continue;
    if (found.lock !== undefined && alive(found.lock.pid)) return { kind: 'held', lock: found.lock };
    removeStale(file, found.text);
  }
}

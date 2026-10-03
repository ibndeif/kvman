import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { z } from '@kvman/sdk';
import { BinFailure } from '../bin/bin-failure.ts';

// The preview's home (plan 09 §9.3, ADR 0009, 125): `<os temp>/kvman-preview-<name>`, emptied at each start and removed
// when the preview stops. A home whose `kvman.lock` names a live pid means its preview still runs.

const lockSchema = z.object({ pid: z.number().int().positive() }).loose();

function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code;
}

// The same liveness rule as the running-kvman lookup: a pid that can't be signaled is gone, unless permission says
// it exists.
function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (hasCode(error, 'ESRCH')) return false;
    if (hasCode(error, 'EPERM')) return true;
    throw error;
  }
}

function lockPid(home: string): number | undefined {
  let text: string;
  try {
    text = readFileSync(path.join(home, 'kvman.lock'), 'utf8');
  } catch (error) {
    if (hasCode(error, 'ENOENT')) return undefined;
    throw error;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return undefined;
  }
  const lock = lockSchema.safeParse(raw);
  return lock.success ? lock.data.pid : undefined;
}

/** The preview's home folder for `name`. */
export function previewHome(name: string): string {
  return path.join(tmpdir(), `kvman-preview-${name}`);
}

/** Empties the preview's home, or fails `PREVIEW_FAILED` when its preview still runs. */
export function preparePreviewHome(name: string): string {
  const home = previewHome(name);
  if (existsSync(home)) {
    const pid = lockPid(home);
    if (pid !== undefined && isAlive(pid)) {
      throw new BinFailure('PREVIEW_FAILED', `A preview named ${name} already runs; stop it first or use --name.`, { name });
    }
    rmSync(home, { recursive: true, force: true });
  }
  mkdirSync(home, { recursive: true });
  return home;
}

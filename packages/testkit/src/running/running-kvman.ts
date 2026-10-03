import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { z } from '@kvman/sdk';
import { BinFailure } from '../bin/bin-failure.ts';

// Finding the running kvman (ADR 0010, 19): `--url` replaces the lock file; otherwise the home folder is `--home`,
// then `KVMAN_HOME`, then `~/.kvman`. Only `127.0.0.1` and `localhost` are ever called.

/** A kvman that answers queries over HTTP. */
export type RunningKvman = { baseUrl: string };

/** The kvman can't be reached; the caller treats it as not running. */
export class KvmanUnreachableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KvmanUnreachableError';
  }
}

const lockSchema = z.object({ pid: z.number().int().positive(), port: z.number().int().min(1).max(65_535).optional() });

function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code;
}

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

function baseUrlFromOption(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new BinFailure('VALIDATION_FAILED', `--url ${JSON.stringify(url)} isn't a URL; give an http: URL for 127.0.0.1 or localhost with an explicit port, such as http://127.0.0.1:3737.`);
  }
  if (parsed.protocol !== 'http:' || (parsed.hostname !== '127.0.0.1' && parsed.hostname !== 'localhost') || parsed.port === '') {
    throw new BinFailure('VALIDATION_FAILED', `--url ${JSON.stringify(url)} isn't usable; give an http: URL for 127.0.0.1 or localhost with an explicit port, such as http://127.0.0.1:3737.`);
  }
  return `http://${parsed.hostname}:${parsed.port}`;
}

function resolveHome(home: string | undefined): string {
  if (home !== undefined) return home;
  const fromEnvironment = process.env.KVMAN_HOME;
  if (fromEnvironment !== undefined && fromEnvironment !== '') return fromEnvironment;
  return path.join(homedir(), '.kvman');
}

function baseUrlFromLock(home: string): string | undefined {
  let text: string;
  try {
    text = readFileSync(path.join(home, 'kvman.lock'), 'utf8');
  } catch (error) {
    if (hasCode(error, 'ENOENT')) return undefined;
    throw error;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return undefined;
  }
  const lock = lockSchema.safeParse(parsed);
  if (!lock.success || lock.data.port === undefined || !isAlive(lock.data.pid)) return undefined;
  return `http://127.0.0.1:${String(lock.data.port)}`;
}

/** Finds the running kvman: `undefined` when no lock file, stale lock, or portless lock says one runs. */
export function findRunningKvman(options: { home?: string; url?: string }): RunningKvman | undefined {
  if (options.url !== undefined) return { baseUrl: baseUrlFromOption(options.url) };
  const baseUrl = baseUrlFromLock(resolveHome(options.home));
  return baseUrl === undefined ? undefined : { baseUrl };
}

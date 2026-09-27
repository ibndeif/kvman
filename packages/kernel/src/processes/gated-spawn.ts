import { spawn, type ChildProcess } from 'node:child_process';
import { Readable, Writable } from 'node:stream';

// 03 §3.7, ADR 0139: the shell waits for one line on fd 3, the release, then replaces itself with the command, whose
// stderr joins its stdout; a release pipe that closes first (the kernel died) ends it without running anything.
const gate = 'read -r _ <&3 || exit 125; exec 3<&-; exec "$0" "$@" 2>&1';

export type GatedSpawnOptions = { command: string; args: readonly string[]; cwd: string; env: NodeJS.ProcessEnv };

export type ChildExit = { exitCode: number | null; signal: string | null };

// A process started in its own process group (setsid, so its group id is its pid) and held until released.
export type GatedChild = {
  pid: number;
  output: Readable;
  stdin: Writable;
  exited: Promise<ChildExit>;
  release(): void;
  // Closes the release pipe unreleased: the shell exits without running the command.
  abandon(): void;
};

function streamOf<Stream>(value: unknown, type: abstract new (...args: never[]) => Stream, name: string): Stream {
  if (value instanceof type) return value;
  throw new Error(`the gated child has no ${name} pipe`);
}

function spawned(child: ChildProcess): Promise<number> {
  return new Promise((resolve, reject) => {
    child.once('spawn', () => {
      if (child.pid === undefined) reject(new Error('the gated child has no pid'));
      else resolve(child.pid);
    });
    child.once('error', reject);
  });
}

export async function spawnGated(options: GatedSpawnOptions): Promise<GatedChild> {
  const child = spawn('/bin/sh', ['-c', gate, options.command, ...options.args], {
    cwd: options.cwd, env: options.env, detached: true, stdio: ['pipe', 'pipe', 'ignore', 'pipe'],
  });
  const exited = new Promise<ChildExit>((resolve) => {
    child.once('exit', (exitCode, signal) => resolve({ exitCode, signal }));
  });
  const pid = await spawned(child);
  const releasePipe = streamOf(child.stdio[3], Writable, 'release');
  return {
    pid,
    output: streamOf(child.stdout, Readable, 'output'),
    stdin: streamOf(child.stdin, Writable, 'stdin'),
    exited,
    release: () => releasePipe.end('\n'),
    abandon: () => releasePipe.destroy(),
  };
}

function isGone(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ESRCH';
}

// Signals a whole process group; a group with no member left is already where the signal would take it.
export function signalGroup(pgid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pgid, signal);
  } catch (error) {
    if (!isGone(error)) throw error;
  }
}

// Whether any member of the group is still alive (signal 0 checks without sending; EPERM means it exists).
export function groupAlive(pgid: number): boolean {
  try {
    process.kill(-pgid, 0);
    return true;
  } catch (error) {
    if (isGone(error)) return false;
    if (error instanceof Error && 'code' in error && error.code === 'EPERM') return true;
    throw error;
  }
}

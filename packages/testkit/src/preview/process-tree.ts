import { spawn, type ChildProcess } from 'node:child_process';

// How the preview bin starts and stops its children, per OS (CLAUDE.md §3): directly on Linux and macOS, each in its
// own process group so a kill ends the whole tree; on Windows through `cmd.exe /d /s /c`, since `npm` and `kvman`
// there are `.cmd` files, and a kill runs `taskkill /T /F`.

/** How to kill a child's whole process tree: its group on Linux and macOS, `taskkill /T /F` on Windows. */
export type TreeKill = { kind: 'group'; pid: number } | { kind: 'taskkill'; command: 'taskkill'; args: string[] };

/** How to kill a child's whole process tree, per OS. */
export function treeKill(platform: NodeJS.Platform, pid: number): TreeKill {
  if (platform === 'win32') return { kind: 'taskkill', command: 'taskkill', args: ['/PID', String(pid), '/T', '/F'] };
  if (platform === 'darwin') return { kind: 'group', pid };
  if (platform === 'linux') return { kind: 'group', pid };
  return { kind: 'group', pid };
}

/** How to start `program` with `args`: directly on Linux and macOS, through `cmd.exe /d /s /c` on Windows. */
export type SpawnCommand = { command: string; args: string[]; detached: boolean };

/** How to start `program` with `args`, per OS. */
export function spawnCommand(platform: NodeJS.Platform, program: string, args: readonly string[]): SpawnCommand {
  if (platform === 'win32') return { command: 'cmd.exe', args: ['/d', '/s', '/c', program, ...args], detached: false };
  if (platform === 'darwin') return { command: program, args: [...args], detached: true };
  if (platform === 'linux') return { command: program, args: [...args], detached: true };
  return { command: program, args: [...args], detached: true };
}

function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code;
}

/** A spawned child with its exit watched from the start, so stopping it never misses the event it waits for. */
export type TrackedChild = {
  /** The child process. */
  child: ChildProcess;
  /** Resolves once the child has exited, closed, or failed to spawn. */
  exited: Promise<void>;
  /** The spawn failure, when the child never started. */
  spawnError: unknown;
};

/** Tracks `child` from now on: `exited` resolves on its first exit, close, or spawn error. */
export function trackChild(child: ChildProcess): TrackedChild {
  let resolveExited = (): void => {};
  const exited = new Promise<void>((resolve) => {
    resolveExited = resolve;
  });
  const tracked: TrackedChild = { child, exited, spawnError: undefined };
  child.once('error', (error) => {
    tracked.spawnError = error;
    resolveExited();
  });
  child.once('exit', () => resolveExited());
  child.once('close', () => resolveExited());
  return tracked;
}

/** Whether the child may still run: no exit, no signal, and no spawn failure. */
export function isRunning(tracked: TrackedChild): boolean {
  return tracked.child.exitCode === null && tracked.child.signalCode === null && tracked.spawnError === undefined;
}

/** Kills a child's whole process tree and resolves once it has exited. */
export async function killProcessTree(tracked: TrackedChild): Promise<void> {
  if (tracked.child.pid !== undefined) {
    const kill = treeKill(process.platform, tracked.child.pid);
    if (kill.kind === 'taskkill') {
      await new Promise<void>((resolve) => {
        const taskkill = spawn(kill.command, kill.args, { stdio: 'ignore', windowsHide: true });
        taskkill.once('error', () => resolve());
        taskkill.once('close', () => resolve());
      });
    } else {
      try {
        process.kill(-kill.pid, 'SIGKILL');
      } catch (error) {
        if (!hasCode(error, 'ESRCH')) throw error;
      }
    }
  }
  await tracked.exited;
}

/** Resolves whether the child exits within `withinMs`; the wait ends on the exit, never on a fixed sleep. */
export function exitWithin(tracked: TrackedChild, withinMs: number): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const done = tracked.exited.then(() => true);
  const timedOut = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), withinMs);
  });
  return Promise.race([done, timedOut]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

/** Stops a preview child: SIGINT first (it stops on it), then SIGKILL to its group; on Windows the tree is killed. */
export async function stopPreviewChild(tracked: TrackedChild, withinMs: number): Promise<void> {
  if (!isRunning(tracked)) return;
  if (process.platform === 'win32') {
    await killProcessTree(tracked);
    return;
  }
  tracked.child.kill('SIGINT');
  if (await exitWithin(tracked, withinMs)) return;
  await killProcessTree(tracked);
}

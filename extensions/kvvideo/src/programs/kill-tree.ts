import { spawn } from 'node:child_process';

// Killing a program's whole tree (plan 16 §16.3): its process group on Linux and macOS, where it starts as the group's
// leader, and `taskkill /T /F` on Windows, which has no groups.

/** How a tree is killed on one OS. */
export type TreeKill = { kind: 'group'; pid: number; signal: 'SIGKILL' } | { kind: 'taskkill'; command: 'taskkill'; args: string[] };

export function treeKillOf(platform: NodeJS.Platform, pid: number): TreeKill {
  if (platform === 'win32') return { kind: 'taskkill', command: 'taskkill', args: ['/PID', String(pid), '/T', '/F'] };
  return { kind: 'group', pid: -pid, signal: 'SIGKILL' };
}

/** Whether a program starts as its own group's leader, so its tree can be killed. */
export function startsOwnGroup(platform: NodeJS.Platform): boolean {
  return platform !== 'win32';
}

/** Kills a running program's tree; a tree that is already gone is left alone. */
export function killTree(pid: number | undefined): void {
  if (pid === undefined) return;
  const kill = treeKillOf(process.platform, pid);
  if (kill.kind === 'taskkill') {
    spawn(kill.command, kill.args, { stdio: 'ignore', windowsHide: true });
    return;
  }
  try {
    process.kill(kill.pid, kill.signal);
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ESRCH')) throw error;
  }
}

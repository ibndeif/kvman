import { spawnSync, type SpawnOptions } from 'node:child_process';

// Ending a process and everything it started (plan 02 §2.16): on Linux and macOS it leads its own process group, which
// gets the signal; Windows has no groups to signal, so `taskkill /T /F` ends the tree at once.

export type StopSignal = 'SIGTERM' | 'SIGKILL';

export type KillPlan = { kind: 'group'; pid: number; signal: StopSignal } | { kind: 'command'; command: string; args: string[] };

export function killPlan(platform: NodeJS.Platform, pid: number, signal: StopSignal): KillPlan {
  if (platform === 'win32') return { kind: 'command', command: 'taskkill', args: ['/PID', String(pid), '/T', '/F'] };
  return { kind: 'group', pid, signal };
}

// On Linux and macOS a process starts detached, so it leads a new process group; on Windows it keeps no window.
export function spawnOptionsFor(platform: NodeJS.Platform): Pick<SpawnOptions, 'detached' | 'windowsHide'> {
  return platform === 'win32' ? { detached: false, windowsHide: true } : { detached: true, windowsHide: true };
}

function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code;
}

function isGone(error: unknown): boolean {
  return hasCode(error, 'ESRCH');
}

// Carries out the plan; a group that has already ended is what the kill wants, so it is done.
export function carryOut(plan: KillPlan): void {
  if (plan.kind === 'command') {
    spawnSync(plan.command, plan.args, { windowsHide: true });
    return;
  }
  try {
    process.kill(-plan.pid, plan.signal);
  } catch (error) {
    if (!isGone(error)) throw error;
  }
}

export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (isGone(error)) return false;
    // EPERM: the process exists but belongs to another user.
    if (hasCode(error, 'EPERM')) return true;
    throw error;
  }
}

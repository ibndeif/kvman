import { existsSync } from 'node:fs';
import path from 'node:path';

// The shell kvcoder runs, per OS (plan 08 §8.3, ADR 0008, 6 and 7): `bash -lc` on Linux and macOS; on Windows
// `pwsh -NoProfile -Command` when PowerShell 7 is on the PATH, else `powershell.exe`. `kvcoder.shell.path` overrides
// the lookup on every OS.

export type Platform = NodeJS.Platform;

/** How to start one shell call. */
export type ShellCommand = { program: string; args: (command: string) => string[]; kind: 'bash' | 'powershell' };

const powershellArgs = (command: string): string[] => ['-NoProfile', '-Command', command];
const bashArgs = (command: string): string[] => ['-lc', command];

function isPowerShell(program: string): boolean {
  return /^(pwsh|powershell)(\.exe)?$/i.test(path.basename(program));
}

/** Whether a program is on the PATH (Windows looks for `<name>.exe`). */
export function onPath(name: string, environment: NodeJS.ProcessEnv, platform: Platform): boolean {
  const folders = (environment['PATH'] ?? environment['Path'] ?? '').split(platform === 'win32' ? ';' : ':').filter((folder) => folder !== '');
  const file = platform === 'win32' ? `${name}.exe` : name;
  return folders.some((folder) => existsSync(path.join(folder, file)));
}

export function shellCommand(platform: Platform, configured: string | null, hasPwsh: () => boolean): ShellCommand {
  const kind = platform === 'win32' ? 'powershell' : 'bash';
  if (configured !== null) return { program: configured, args: isPowerShell(configured) ? powershellArgs : bashArgs, kind };
  if (platform !== 'win32') return { program: 'bash', args: bashArgs, kind };
  return { program: hasPwsh() ? 'pwsh' : 'powershell.exe', args: powershellArgs, kind };
}

/** How to end a process tree: its group on Linux and macOS, `taskkill /T /F` on Windows. */
export type TreeKill = { kind: 'group'; pid: number } | { kind: 'taskkill'; program: 'taskkill'; args: string[] };

export function treeKill(platform: Platform, pid: number): TreeKill {
  return platform === 'win32' ? { kind: 'taskkill', program: 'taskkill', args: ['/PID', String(pid), '/T', '/F'] } : { kind: 'group', pid };
}

export const defaultTimeoutMs = 120_000;
export const maxTimeoutMs = 600_000;

/** A call's timeout: the default, or the model's, cut to 600 s (ADR 0009, 101). */
export function callTimeout(requested: number | undefined): number {
  return Math.min(requested ?? defaultTimeoutMs, maxTimeoutMs);
}

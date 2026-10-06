// How kvbuilder starts npm and npx, per OS (plan 02 §2.16, CLAUDE.md §3): directly on Linux and macOS, in its own process
// group so a cancel ends the whole tree; on Windows through `cmd.exe /d /s /c`, since `npm` there is a `.cmd` file,
// and a cancel runs `taskkill /T /F`.

export type Program = 'npm' | 'npx';

export type ProgramCommand = { command: string; args: string[]; detached: boolean };

export type TreeKill = { kind: 'group'; pid: number } | { kind: 'taskkill'; command: 'taskkill'; args: string[] };

export function programCommand(platform: NodeJS.Platform, program: Program, args: readonly string[]): ProgramCommand {
  if (platform === 'win32') return { command: 'cmd.exe', args: ['/d', '/s', '/c', program, ...args], detached: false };
  return { command: program, args: [...args], detached: true };
}

export function treeKill(platform: NodeJS.Platform, pid: number): TreeKill {
  return platform === 'win32' ? { kind: 'taskkill', command: 'taskkill', args: ['/PID', String(pid), '/T', '/F'] } : { kind: 'group', pid };
}

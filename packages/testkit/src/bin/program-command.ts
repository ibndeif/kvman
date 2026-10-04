// How the testkit bins start npm and npx, per OS: directly on Linux and macOS; on Windows through
// `cmd.exe /d /s /c`, since `npm` there is a `.cmd` file.

export type Program = 'npm' | 'npx';

export type ProgramCommand = { command: string; args: string[] };

export function programCommand(platform: NodeJS.Platform, program: Program, args: readonly string[]): ProgramCommand {
  if (platform === 'win32') return { command: 'cmd.exe', args: ['/d', '/s', '/c', program, ...args] };
  return { command: program, args: [...args] };
}

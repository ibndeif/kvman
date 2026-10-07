import { spawn } from 'node:child_process';

// Running `npm` and `taskkill` for `kvman uninstall` (ADR 0031, 6 to 8). On Windows `npm` is `npm.cmd`, which only a
// shell starts; every argument given here is a fixed word or a process id, never text a person typed.

export type ProgramResult = { started: boolean; code: number; output: string };

/** Runs a program to its end; `shown` also copies its output to the terminal. */
export type RunProgram = (program: string, args: readonly string[], output: 'captured' | 'shown') => Promise<ProgramResult>;

export type StartProgram = typeof spawn;

export function programRunner(platform: NodeJS.Platform, terminal: NodeJS.WritableStream, start: StartProgram = spawn): RunProgram {
  return (program, args, output) =>
    new Promise<ProgramResult>((resolve) => {
      const child =
        platform === 'win32'
          ? start(program, [...args], { shell: true, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
          : start(program, [...args], { stdio: ['ignore', 'pipe', 'pipe'] });
      let text = '';
      child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
        text += chunk;
        if (output === 'shown') terminal.write(chunk);
      });
      child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
        if (output === 'shown') terminal.write(chunk);
      });
      child.once('error', () => resolve({ started: false, code: 1, output: text }));
      child.once('close', (code) => resolve({ started: true, code: code ?? 1, output: text }));
    });
}

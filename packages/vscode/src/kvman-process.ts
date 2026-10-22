import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

// Running the `kvman` program (plan 15 §15.3): directly on Linux and macOS, and through `cmd.exe` on Windows, where npm
// installs it as a `.cmd` file that Node doesn't start by itself. Its lines are read whole; its stderr isn't needed,
// since kvman writes the same records to its log file.

export type StartCommand = { file: string; args: string[]; windowsVerbatimArguments: boolean };
export type ProcessHandlers = { line(text: string): void; exited(): void };
export type KvmanProcess = { write(text: string): void; closeInput(): void };
export type ProgramPlace = { program: string; folder: string; platform: NodeJS.Platform; comSpec: string | undefined };

export function startCommand(place: ProgramPlace, args: readonly string[]): StartCommand {
  if (place.platform !== 'win32') return { file: place.program, args: [...args], windowsVerbatimArguments: false };
  return { file: place.comSpec ?? 'cmd.exe', args: ['/d', '/s', '/c', `""${place.program}" ${args.join(' ')}"`], windowsVerbatimArguments: true };
}

/** The program's `--version` output, or undefined when it can't be started. */
export function runVersion(place: ProgramPlace): Promise<string | undefined> {
  const command = startCommand(place, ['--version']);
  return new Promise((resolve) => {
    const child = spawn(command.file, command.args, { cwd: place.folder, stdio: ['ignore', 'pipe', 'ignore'], windowsVerbatimArguments: command.windowsVerbatimArguments });
    let output = '';
    child.stdout.setEncoding('utf8').on('data', (text: string) => (output += text));
    child.once('error', () => resolve(undefined));
    child.once('close', (code) => resolve(code === 0 ? output : undefined));
  });
}

/** Starts `kvman --pipe --no-open` in the folder; the handlers get each whole line and the program's end. */
export function startKvman(place: ProgramPlace, handlers: ProcessHandlers): KvmanProcess {
  const command = startCommand(place, ['--pipe', '--no-open']);
  const child = spawn(command.file, command.args, { cwd: place.folder, stdio: ['pipe', 'pipe', 'ignore'], windowsVerbatimArguments: command.windowsVerbatimArguments });
  createInterface({ input: child.stdout }).on('line', handlers.line);
  let ended = false;
  const end = (): void => {
    if (ended) return;
    ended = true;
    handlers.exited();
  };
  child.once('error', end);
  child.once('close', end);
  // A closed input is how kvman is stopped (plan 14 §14.2); writing after kvman ended reports EPIPE here, not a crash.
  child.stdin.on('error', end);
  return {
    write: (text) => {
      if (!ended) child.stdin.write(`${text}\n`);
    },
    closeInput: () => child.stdin.end(),
  };
}

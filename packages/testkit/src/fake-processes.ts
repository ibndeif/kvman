import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CommandResolver } from '@kvman/kernel';

/** What a fake process writes and how it exits (ADR 0166). */
export type FakeProcess = { stdout?: string[]; stderr?: string[]; exitCode?: number };

const script = fileURLToPath(new URL(`./fake-process-script${extname(fileURLToPath(import.meta.url))}`, import.meta.url));

// A spawn of a listed command runs the testkit's stand-in with its script; every other command runs as requested.
export function fakeCommands(processes: Readonly<Record<string, FakeProcess>>): CommandResolver {
  return (command, args) => {
    const fake = Object.hasOwn(processes, command) ? processes[command] : undefined;
    return fake === undefined ? { command, args } : { command: process.execPath, args: [script, JSON.stringify(fake)] };
  };
}

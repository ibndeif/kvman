import type { SpawnOptions } from 'node:child_process';
import spawn from 'cross-spawn';
import { ReadBuffer, serializeMessage } from '@modelcontextprotocol/sdk/shared/stdio.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { killTree } from '../calls/run-shell.ts';
import type { Platform } from '../calls/shell-command.ts';

// An MCP server run as a command (plan 08 §8.5, ADR 0020, 4 and 17): JSON-RPC lines on its standard input and output.
// It is a short-lived process of the call's own job (plan 02 §2.6), started in its own process group on Linux and
// macOS so that closing kills its whole tree, as a shell call's is killed. `cross-spawn` starts a `.cmd` on Windows.

export type CommandStart = { command: string; args: readonly string[]; cwd: string; env: Readonly<Record<string, string>> };

/** A command's transport, and the last of what the command wrote to its error output. */
export type CommandTransport = Transport & { errorOutput(): string };

/** How the command is started on each OS: in its own group where the group is what gets killed. */
export function commandSpawn(platform: Platform, start: CommandStart, environment: NodeJS.ProcessEnv): SpawnOptions {
  return { cwd: start.cwd, env: { ...environment, ...start.env }, stdio: ['pipe', 'pipe', 'pipe'], detached: platform !== 'win32', windowsHide: true };
}

const errorOutputKept = 2_000;

export function commandTransport(start: CommandStart): CommandTransport {
  const buffer = new ReadBuffer();
  let child: ReturnType<typeof spawn> | undefined;
  let closed: Promise<void> = Promise.resolve();
  let errors = Buffer.alloc(0);

  const transport: CommandTransport = {
    errorOutput: () => errors.toString('utf8').trim(),
    start: () =>
      new Promise((resolve, reject) => {
        const started = spawn(start.command, [...start.args], commandSpawn(process.platform, start, process.env));
        child = started;
        closed = new Promise((done) => started.once('exit', () => done()));
        started.once('error', (error) => {
          reject(error);
          transport.onerror?.(error);
        });
        started.once('spawn', () => resolve());
        started.once('exit', () => transport.onclose?.());
        started.stdin?.on('error', (error) => transport.onerror?.(error));
        started.stderr?.on('data', (chunk: Buffer) => (errors = Buffer.concat([errors, chunk]).subarray(-errorOutputKept)));
        started.stdout?.on('data', (chunk: Buffer) => {
          buffer.append(chunk);
          try {
            for (let message = buffer.readMessage(); message !== null; message = buffer.readMessage()) transport.onmessage?.(message);
          } catch (error) {
            transport.onerror?.(error instanceof Error ? error : new Error(String(error)));
          }
        });
      }),
    send: (message) =>
      new Promise((resolve, reject) => {
        const input = child?.stdin;
        if (input === undefined || input === null || !input.writable) return reject(new Error('The server has exited.'));
        input.write(serializeMessage(message), (error) => (error === null || error === undefined ? resolve() : reject(error)));
      }),
    // A command that never started has no pid and nothing to wait for. A process that left the group may still hold
    // the pipes, so the wait is for the command's exit, and the pipes are then dropped.
    close: async () => {
      const pid = child?.pid;
      if (pid === undefined) return;
      killTree(pid);
      await closed;
      child?.stdout?.destroy();
      child?.stderr?.destroy();
      buffer.clear();
    },
  };
  return transport;
}

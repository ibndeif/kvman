import { spawn, type StdioOptions } from 'node:child_process';
import { extname } from 'node:path';
import { Socket } from 'node:net';
import { fileURLToPath } from 'node:url';
import type { HostThread, StartHostThread } from '../host-thread.ts';
import { FrameLines } from './frame-lines.ts';

// The sandboxed host's entry is the sibling module of this one in the same build, like the host worker's.
function sandboxEntry(): { file: string; execArgv: string[] } {
  const extension = extname(fileURLToPath(import.meta.url));
  const file = fileURLToPath(new URL(`./sandbox-host${extension}`, import.meta.url));
  return { file, execArgv: extension === '.ts' ? ['--conditions=@kvman/source'] : [] };
}

// ADR 0129: read access to exactly the snapshot and the kernel's runtime packages, and nothing a grant could widen.
export function sandboxArguments(snapshotFolder: string, readRoots: readonly string[]): string[] {
  const { file, execArgv } = sandboxEntry();
  return [...execArgv, '--permission', ...[snapshotFolder, ...readRoots].map((root) => `--allow-fs-read=${root}`), '--no-experimental-sqlite', file];
}

// ADR 0129: an empty environment; stdin, stdout, and stderr ignored; frames on file descriptor 3.
export const sandboxStdio: StdioOptions = ['ignore', 'ignore', 'ignore', 'pipe'];
export const sandboxEnvironment: NodeJS.ProcessEnv = {};

function frameOf(line: string): unknown {
  try {
    return JSON.parse(line);
  } catch {
    // A line that is not JSON is passed on as text, which fails the frame schema: the loss of this host (ADR 0129).
    return line;
  }
}

// 03 §3.5: one sandboxed extension host, a child process running Node's permission model, speaking JSON lines.
export function sandboxProcessStarter(readRoots: readonly string[]): (snapshotFolder: string) => StartHostThread {
  return (snapshotFolder) => (events) => {
    const child = spawn(process.execPath, sandboxArguments(snapshotFolder, readRoots), { stdio: sandboxStdio, env: sandboxEnvironment });
    const channel = child.stdio[3];
    if (!(channel instanceof Socket)) throw new Error('a sandboxed host starts with a pipe on file descriptor 3');
    const lines = new FrameLines();
    channel.on('data', (chunk: Buffer) => {
      for (const line of lines.push(chunk)) events.frame(frameOf(line));
    });
    let ended = false;
    const end = (): void => {
      if (ended) return;
      ended = true;
      events.exit();
    };
    channel.on('error', (error: unknown) => events.failed(error));
    child.on('error', (error: unknown) => {
      events.failed(error);
      end();
    });
    child.on('exit', end);
    const thread: HostThread = {
      identity: { pid: child.pid ?? 0, threadId: 0 },
      post: (frame) => {
        channel.write(`${JSON.stringify(frame)}\n`);
      },
      postValue: (invocationId, callId, value) => {
        channel.write(`{"frame":"rpcResult","invocationId":${JSON.stringify(invocationId)},"callId":${callId},"result":{"ok":true,"value":`);
        channel.write(value);
        channel.write('}}\n');
      },
      terminate: () => {
        child.kill('SIGKILL');
      },
    };
    return thread;
  };
}

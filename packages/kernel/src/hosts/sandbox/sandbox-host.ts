import { Socket } from 'node:net';
import type { HostToKernelFrame } from '@kvman/protocol';
import { resolveSdkToKernel } from '../worker/sdk-resolution.ts';
import { WorkerRuntime } from '../worker/worker-runtime.ts';
import { FrameLines } from './frame-lines.ts';
import { PoolReads } from './pool-reads.ts';

// A sandboxed extension host (03 §3.5, ADR 0129): a child process under Node's permission model that runs the same
// runtime as a worker, speaks JSON lines on file descriptor 3, and reads through the kernel's read pool. It exits when
// the kernel's end of the pipe closes, so a killed kernel leaves no host behind.
resolveSdkToKernel();
const channel = new Socket({ fd: 3, readable: true, writable: true });
const post = (frame: HostToKernelFrame): void => {
  channel.write(`${JSON.stringify(frame)}\n`);
};
const runtime = new WorkerRuntime(post, (client, invocationId) => new PoolReads(client, invocationId));
const lines = new FrameLines();
channel.on('data', (chunk: Buffer) => {
  for (const line of lines.push(chunk)) runtime.receive(JSON.parse(line));
});
channel.on('close', () => process.exit(0));

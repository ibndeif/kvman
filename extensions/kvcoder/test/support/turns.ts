import { existsSync } from 'node:fs';
import { z } from '@kvman/sdk';
import type { ProgressChunk, TestKernel } from '@kvman/testkit';

// Following a turn as the conversation does: the send's own chunks, then each step's through its follow chunk, and a
// child's chain through its subagent chunk. With one worker, a follow chunk always arrives before the next step's.

const followSchema = z.object({ type: z.enum(['follow', 'subagent']), jobId: z.string() });

export type TurnStream = { chunks: ProgressChunk[]; onProgress(chunk: ProgressChunk): void };

export function turnStream(kernel: TestKernel): TurnStream {
  const chunks: ProgressChunk[] = [];
  const onProgress = (chunk: ProgressChunk): void => {
    chunks.push(chunk);
    const next = followSchema.safeParse(chunk.data);
    if (next.success) kernel.watch(next.data.jobId, onProgress);
  };
  return { chunks, onProgress };
}

/** Sends the person's message as the UI does, following the turn's chunks. */
export async function sendStreamed(kernel: TestKernel, sessionId: string, text: string, workspaceId?: string): Promise<TurnStream> {
  const stream = turnStream(kernel);
  const jobId = await kernel.execAsync('kvcoder.message.send', { sessionId, text }, { onProgress: stream.onProgress, ...(workspaceId === undefined ? {} : { workspaceId }) });
  await kernel.waitForJob(jobId);
  return stream;
}

/** The chunks of kvcoder itself (not kvai's deltas). */
export function kvcoderChunks(stream: TurnStream): unknown[] {
  return stream.chunks.filter((chunk) => chunk.source === '@kvman/kvcoder').map((chunk) => chunk.data);
}

/** A new session with a title, so no title job runs (ADR 0009, 103). */
export async function newSession(kernel: TestKernel, workspaceId?: string): Promise<string> {
  return (await kernel.exec('kvcoder.session.create', { title: 'Test' }, workspaceId === undefined ? {} : { workspaceId })).id;
}

/** The session's status and its newest turn. */
export async function turnState(kernel: TestKernel, sessionId: string) {
  const session = await kernel.exec('kvcoder.session.get', { sessionId });
  const [turn] = await kernel.exec('kvcoder.turn.list', { sessionId, limit: 1 });
  return { session, turn };
}

export const fileExists = (file: string): boolean => existsSync(file);

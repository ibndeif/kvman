import type { Json } from '@kvman/sdk';
import { progressReplayBytes } from '../limits.ts';

// Progress chunks go to whoever watches the root job's stream. A running job keeps its last 256 KiB of chunks, which a
// client that connects late gets first; the buffer goes when the job ends (plan 04 §4.4, ADR 0009, 139).

export type ProgressChunk = { source: string; data: Json };

export type ProgressHub = {
  publish(rootId: string, chunk: ProgressChunk): void;
  watch(jobId: string, listener: (chunk: ProgressChunk) => void): () => void;
};

type Buffered = { chunks: { chunk: ProgressChunk; bytes: number }[]; bytes: number };

/** `ended` settles when a root job has ended (or has no row, as a sync job's), which drops its buffer. */
export function createProgressHub(ended: (rootId: string) => Promise<unknown>, replayBytes = progressReplayBytes): ProgressHub {
  const listeners = new Map<string, Set<(chunk: ProgressChunk) => void>>();
  const buffers = new Map<string, Buffered>();
  const buffer = (rootId: string, chunk: ProgressChunk): void => {
    let held = buffers.get(rootId);
    if (held === undefined) {
      held = { chunks: [], bytes: 0 };
      buffers.set(rootId, held);
      const drop = (): void => void buffers.delete(rootId);
      ended(rootId).then(drop, drop);
    }
    const bytes = Buffer.byteLength(JSON.stringify(chunk));
    held.chunks.push({ chunk, bytes });
    held.bytes += bytes;
    while (held.bytes > replayBytes && held.chunks.length > 1) held.bytes -= held.chunks.shift()?.bytes ?? 0;
  };
  return {
    publish: (rootId, chunk) => {
      buffer(rootId, chunk);
      for (const listener of listeners.get(rootId) ?? []) listener(chunk);
    },
    watch: (jobId, listener) => {
      for (const { chunk } of buffers.get(jobId)?.chunks ?? []) listener(chunk);
      const set = listeners.get(jobId) ?? new Set();
      set.add(listener);
      listeners.set(jobId, set);
      return () => {
        set.delete(listener);
        if (set.size === 0) listeners.delete(jobId);
      };
    },
  };
}

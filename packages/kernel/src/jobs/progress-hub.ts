import type { Json } from '@kvman/sdk';

// Progress chunks go to whoever watches the root job's stream; nothing is stored (plan 04 §4.4).

export type ProgressChunk = { source: string; data: Json };

export type ProgressHub = {
  publish(rootId: string, chunk: ProgressChunk): void;
  watch(jobId: string, listener: (chunk: ProgressChunk) => void): () => void;
};

export function createProgressHub(): ProgressHub {
  const listeners = new Map<string, Set<(chunk: ProgressChunk) => void>>();
  return {
    publish: (rootId, chunk) => {
      for (const listener of listeners.get(rootId) ?? []) listener(chunk);
    },
    watch: (jobId, listener) => {
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

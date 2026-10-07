import { ref, watch, type Ref } from 'vue';
import type { Kvman } from '@kvman/sdk/web';
import type { Message } from '../../src/index.ts';
import { backgroundRef } from './message-parts.ts';

// What the chat's job list says of each finished background run, by its id (ADR 0036, 14; ADR 0037, 2): how long it
// took, and its title, which for a helper is the name its run was given. Read when a result arrives whose run isn't
// known yet. The list holds the newest 50 runs, so an older result has neither.
export type FinishedRun = { title: string; ranMs: number };

export function useFinishedRuns(kvman: Kvman, sessionId: () => string | undefined, messages: Ref<readonly Message[]>, failed: (error: unknown) => void): Ref<ReadonlyMap<string, FinishedRun>> {
  const runs = ref<ReadonlyMap<string, FinishedRun>>(new Map());

  async function load(id: string): Promise<void> {
    try {
      const jobs = await kvman.exec('kvcoder.job.list', { sessionId: id });
      if (sessionId() !== id) return;
      runs.value = new Map(jobs.flatMap((job) => (job.endedAt === undefined ? [] : [[job.id, { title: job.title, ranMs: Math.max(Date.parse(job.endedAt) - Date.parse(job.startedAt), 0) }] as const])));
    } catch (error) {
      failed(error);
    }
  }

  watch(
    () => [sessionId(), messages.value.flatMap((message) => backgroundRef(message) ?? []).join(' ')] as const,
    ([id, refs], previous) => {
      if (id !== previous?.[0]) runs.value = new Map();
      if (id !== undefined && refs !== '') void load(id);
    },
    { immediate: true },
  );

  return runs;
}

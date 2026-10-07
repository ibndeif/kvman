import { ref, watch, type Ref } from 'vue';
import type { Kvman } from '@kvman/sdk/web';
import type { Message } from '../../src/index.ts';
import { backgroundRef } from './message-parts.ts';

// How long each finished background run took, by its id (ADR 0036, 14): read from the chat's job list when a result
// arrives whose run isn't known yet. The list holds the newest 50 runs, so an older result has no time.
export function useRunTimes(kvman: Kvman, sessionId: () => string | undefined, messages: Ref<readonly Message[]>, failed: (error: unknown) => void): Ref<ReadonlyMap<string, number>> {
  const times = ref<ReadonlyMap<string, number>>(new Map());

  async function load(id: string): Promise<void> {
    try {
      const jobs = await kvman.exec('kvcoder.job.list', { sessionId: id });
      if (sessionId() !== id) return;
      times.value = new Map(jobs.flatMap((job) => (job.endedAt === undefined ? [] : [[job.id, Math.max(Date.parse(job.endedAt) - Date.parse(job.startedAt), 0)] as const])));
    } catch (error) {
      failed(error);
    }
  }

  watch(
    () => [sessionId(), messages.value.flatMap((message) => backgroundRef(message) ?? []).join(' ')] as const,
    ([id, refs], previous) => {
      if (id !== previous?.[0]) times.value = new Map();
      if (id !== undefined && refs !== '') void load(id);
    },
    { immediate: true },
  );

  return times;
}

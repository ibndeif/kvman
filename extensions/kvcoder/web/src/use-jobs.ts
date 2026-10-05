import { computed, onBeforeUnmount, ref, watch, type Ref } from 'vue';
import type { Kvman } from '@kvman/sdk/web';
import { toastProblem, type Translate } from './kvman.ts';

// A chat's background jobs for the Running chip (plan 08 §8.7, ADR 0009, 153): read after every step, and every 5 s
// while one runs or the list is open, with the output of each job whose Logs are open.

export type Job = { id: string; kind: 'process' | 'subagent' | 'worker'; title: string; call: string; status: string; startedAt: string; endedAt?: string | undefined; exitCode?: number | undefined; links: string[] };

const refreshEvery = 5;

/** A running job's time: seconds, then minutes and seconds. */
export function elapsed(t: Translate, milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return seconds < 60 ? t('kvcoder.ui.seconds', { count: seconds }) : t('kvcoder.ui.jobs.minutes', { minutes: Math.floor(seconds / 60), seconds: seconds % 60 });
}

export function useJobs(kvman: Kvman, sessionId: () => string, open: Ref<boolean>) {
  const jobs = ref<Job[]>([]);
  const logs = ref<Record<string, string>>({});
  const stopping = ref<ReadonlySet<string>>(new Set());
  const now = ref(Date.now());
  const running = computed(() => jobs.value.filter((job) => job.status === 'running'));
  let ticks = 0;
  let timer: ReturnType<typeof setInterval> | undefined;

  async function loadLogs(): Promise<void> {
    for (const id of Object.keys(logs.value)) {
      const found = await kvman.exec('kvcoder.job.get', { sessionId: sessionId(), id });
      logs.value = { ...logs.value, [id]: typeof found.output === 'string' ? found.output : '' };
    }
  }

  async function load(): Promise<void> {
    try {
      jobs.value = await kvman.exec('kvcoder.job.list', { sessionId: sessionId() });
      await loadLogs();
    } catch (error) {
      toastProblem(kvman, error);
    }
  }

  async function toggleLogs(id: string): Promise<void> {
    if (logs.value[id] !== undefined) {
      logs.value = Object.fromEntries(Object.entries(logs.value).filter(([key]) => key !== id));
      return;
    }
    logs.value = { ...logs.value, [id]: '' };
    await load();
  }

  async function stop(id: string): Promise<void> {
    stopping.value = new Set([...stopping.value, id]);
    try {
      await kvman.exec('kvcoder.job.cancel', { sessionId: sessionId(), id });
    } catch (error) {
      toastProblem(kvman, error);
    }
    stopping.value = new Set([...stopping.value].filter((other) => other !== id));
    await load();
  }

  watch(() => running.value.length > 0 || open.value, (active) => {
    clearInterval(timer);
    timer = undefined;
    if (!active) return;
    timer = setInterval(() => {
      now.value = Date.now();
      ticks += 1;
      if (ticks % refreshEvery === 0) void load();
    }, 1000);
  }, { immediate: true });
  onBeforeUnmount(() => clearInterval(timer));

  return { jobs, running, logs, stopping, now, load, toggleLogs, stop };
}

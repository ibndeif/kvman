import type { Kvman } from '@kvman/sdk/web';
import { computed, ref, watch } from 'vue';
import { toastProblem } from './kvman.ts';
import { useSetting } from './use-setting.ts';
import { workerEntries, type WorkerEntry } from './worker-entry.ts';

// The workers of kvcoder's configuration (plan 08 §8.7, ADR 0021, 4, 6, and 38): the list is the setting
// `kvcoder.delegate.workers`, written whole in the scope the extension's page is set to. A program worker's state is
// checked, not stored: whether its program is installed.

/** What a program worker's row says: nothing more once it is `ready`. */
export type WorkerState = 'checking' | 'ready' | 'notFound';

export function useWorkers(kvman: Kvman) {
  const setting = useSetting(kvman, 'kvcoder.delegate.workers');
  const workers = computed(() => workerEntries(setting.value.value));
  const states = ref<Record<string, WorkerState>>({});

  async function check(name: string): Promise<void> {
    states.value = { ...states.value, [name]: 'checking' };
    let state: WorkerState;
    try {
      state = (await kvman.exec('kvcoder.delegate.worker.check', { name })).status;
    } catch (error) {
      toastProblem(kvman, error);
      state = 'notFound';
    }
    states.value = { ...states.value, [name]: state };
  }

  // The list as stored decides what is checked: each program worker, when it is first seen.
  watch(workers, (now) => {
    for (const worker of now) if (worker.kind !== 'subagent' && !(worker.name in states.value)) void check(worker.name);
  });

  /** Stores a worker in its place in the list, or last when it is new. */
  const save = (entry: WorkerEntry): Promise<boolean> => {
    const index = workers.value.findIndex((worker) => worker.name === entry.name);
    return setting.set(index < 0 ? [...workers.value, entry] : [...workers.value.slice(0, index), entry, ...workers.value.slice(index + 1)]);
  };

  return {
    workers,
    states,
    locked: setting.locked,
    changed: setting.changed,
    working: setting.saving,
    save,
    remove: (name: string): Promise<boolean> => setting.set(workers.value.filter((worker) => worker.name !== name)),
    toggle: (name: string): Promise<boolean> => setting.set(workers.value.map((worker) => (worker.name === name ? { ...worker, enabled: !worker.enabled } : worker))),
    reset: setting.reset,
    check,
  };
}

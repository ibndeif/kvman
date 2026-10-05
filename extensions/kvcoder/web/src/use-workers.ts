import type { Kvman } from '@kvman/sdk/web';
import { computed } from 'vue';
import { useSetting } from './use-setting.ts';
import { workerEntries, type WorkerEntry } from './worker-entry.ts';

// The workers of kvcoder's configuration (plan 08 §8.7, ADR 0021, 4 and 6): the list is the setting
// `kvcoder.delegate.workers`, written whole in the scope the extension's page is set to.

export function useWorkers(kvman: Kvman) {
  const setting = useSetting(kvman, 'kvcoder.delegate.workers');
  const workers = computed(() => workerEntries(setting.value.value));

  /** Stores a worker in its place in the list, or last when it is new. */
  const save = (entry: WorkerEntry): Promise<boolean> => {
    const index = workers.value.findIndex((worker) => worker.name === entry.name);
    return setting.set(index < 0 ? [...workers.value, entry] : [...workers.value.slice(0, index), entry, ...workers.value.slice(index + 1)]);
  };

  return {
    workers,
    locked: setting.locked,
    changed: setting.changed,
    working: setting.saving,
    save,
    remove: (name: string): Promise<boolean> => setting.set(workers.value.filter((worker) => worker.name !== name)),
    toggle: (name: string): Promise<boolean> => setting.set(workers.value.map((worker) => (worker.name === name ? { ...worker, enabled: !worker.enabled } : worker))),
    reset: setting.reset,
  };
}

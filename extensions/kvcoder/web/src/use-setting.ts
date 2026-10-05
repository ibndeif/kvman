import type { Json } from '@kvman/sdk';
import type { Kvman } from '@kvman/sdk/web';
import { computed, onMounted, ref, shallowRef, watch } from 'vue';
import { toastProblem } from './kvman.ts';

// One of kvcoder's settings as its configuration edits it (ADR 0014, 8; ADR 0015, 7): the value in effect, where it
// comes from, and writes into the scope the extension's page is set to.
export function useSetting(kvman: Kvman, key: string) {
  const value = shallowRef<Json>(null);
  const source = ref('default');
  const saving = ref(false);

  const load = async (): Promise<void> => {
    const setting = (await kvman.exec('kernel.settings.list', {})).find((candidate) => candidate.key === key);
    value.value = setting?.value ?? null;
    source.value = setting?.source ?? 'default';
  };

  // Says whether the change was made; a failed one is toasted.
  const write = async (change: () => Promise<unknown>): Promise<boolean> => {
    saving.value = true;
    try {
      await change();
      await load();
      return true;
    } catch (error) {
      toastProblem(kvman, error);
      return false;
    } finally {
      saving.value = false;
    }
  };

  onMounted(load);
  watch(() => [kvman.scope.value, kvman.workspace.value.id], load);

  return {
    value,
    saving,
    // On "All workspaces", a value the workspace set for itself is the one in effect, and can't be edited from here.
    locked: computed(() => kvman.scope.value === 'global' && source.value === 'workspace'),
    changed: computed(() => source.value === kvman.scope.value),
    set: (next: Json) => write(() => kvman.exec('kernel.settings.set', { key, value: next, scope: kvman.scope.value })),
    reset: () => write(() => kvman.exec('kernel.settings.reset', { key, scope: kvman.scope.value })),
  };
}

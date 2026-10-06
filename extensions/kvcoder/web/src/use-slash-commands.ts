import { onMounted, shallowRef, type ShallowRef } from 'vue';
import type { Kvman } from '@kvman/sdk/web';
import { toastProblem } from './kvman.ts';
import type { RegisteredSlash } from './slash-commands.ts';

// The slash commands that extensions registered (plan 08 §8.4; ADR 0027, 9), read once when the send box's page mounts.
// A failed read shows its Problem and leaves the list empty, so kvcoder's own commands still work.
export function useSlashCommands(kvman: Kvman): ShallowRef<readonly RegisteredSlash[]> {
  const registered = shallowRef<readonly RegisteredSlash[]>([]);
  onMounted(async () => {
    try {
      registered.value = await kvman.exec('kvcoder.slash.list', {});
    } catch (error) {
      toastProblem(kvman, error);
    }
  });
  return registered;
}

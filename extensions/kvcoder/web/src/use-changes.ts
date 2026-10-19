import { ref, shallowRef, watch, type Ref } from 'vue';
import type { Kvman } from '@kvman/sdk/web';

// One open chat's changes (plan 08 §8.7, ADR 0093, 2): their count after each step, for the header's button, and the
// files with their diffs while the panel shows them.

export type ChangedFile = { path: string; added: number; removed: number; diff: string; state: 'changed' | 'created' | 'deleted' };
export type ChangeList = { files: ChangedFile[]; diffs: boolean };

export function useChanges(kvman: Kvman, sessionId: () => string | undefined, stamp: () => string | undefined, failed: (error: unknown) => void) {
  const count = ref(0);
  const shown = ref(false);
  const list = shallowRef<ChangeList | undefined>(undefined);
  let ticket = 0;

  async function load(): Promise<void> {
    const session = sessionId();
    const mine = (ticket += 1);
    if (session === undefined) return;
    try {
      const found = await kvman.exec('kvcoder.change.list', shown.value ? { sessionId: session } : { sessionId: session, withDiffs: false });
      if (mine !== ticket || sessionId() !== session) return;
      count.value = found.files.length;
      if (shown.value) list.value = found;
    } catch (error) {
      if (mine === ticket) failed(error);
    }
  }

  watch(sessionId, () => {
    shown.value = false;
    list.value = undefined;
    count.value = 0;
  });
  watch([sessionId, stamp, shown], () => void load(), { immediate: true });
  return { count, shown, list, reload: load };
}

type Panel = { shown: Ref<boolean>; close(): void };

/** The changes and the rest of the panel take turns: the map or an artifact that shows itself takes it from them. */
export function useChangesPanel(changes: ReturnType<typeof useChanges>, executionMap: Panel, artifacts: { surfaced: Ref<unknown> }) {
  watch(executionMap.shown, (shown) => {
    if (shown) changes.shown.value = false;
  });
  watch(artifacts.surfaced, (artifact) => {
    if (artifact !== undefined) changes.shown.value = false;
  });
  return {
    toggleChanges(): void {
      if (!changes.shown.value) executionMap.shown.value = false;
      changes.shown.value = !changes.shown.value;
    },
    closePanel(): void {
      changes.shown.value = false;
      executionMap.close();
    },
  };
}

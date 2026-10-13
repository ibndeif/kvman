import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { Kvman } from '@kvman/sdk/web';
import { mapCounts, type ExecutionMapView } from './map-layout.ts';
import type { useArtifacts } from './use-artifacts.ts';

// One open chat's execution map (plan 08 §8.7, ADR 0064): the map, and whether the panel shows it in place of an
// artifact. It is read whenever the chat changes. The first read marks what is there without opening; a map that
// appears later opens the panel on it, and an artifact that then appears takes the panel back.

type Artifacts = Pick<ReturnType<typeof useArtifacts>, 'shown' | 'open' | 'openArtifact' | 'toggle' | 'close'>;

export function useExecutionMap(kvman: Kvman, sessionId: () => string | undefined, stamp: () => string | undefined, artifacts: Artifacts, failed: (error: unknown) => void) {
  const map = ref<ExecutionMapView | null>(null);
  const shown = ref(false);
  let current: string | undefined = undefined;
  let known: boolean | undefined = undefined;
  let loading = 0;
  let stopped = false;

  async function load(): Promise<void> {
    const session = sessionId();
    if (session !== current) {
      current = session;
      known = undefined;
      map.value = null;
      shown.value = false;
    }
    if (session === undefined) return;
    const ticket = (loading += 1);
    try {
      const found = await kvman.exec('kvcoder.map.get', { sessionId: session });
      if (stopped || ticket !== loading || sessionId() !== session) return;
      map.value = found;
      if (found === null) shown.value = false;
      else if (known === false) shown.value = true;
      known = found !== null;
    } catch (error) {
      if (!stopped && ticket === loading) failed(error);
    }
  }

  const counts = computed(() => (map.value === null ? undefined : mapCounts(map.value.steps)));

  function selectArtifact(id: string): void {
    shown.value = false;
    artifacts.openArtifact(id);
  }

  // The artifacts button leaves the map for the artifacts, and otherwise opens and closes them as before.
  function toggleArtifacts(): void {
    if (shown.value) {
      shown.value = false;
      if (!artifacts.open.value) artifacts.toggle();
    } else artifacts.toggle();
  }

  function close(): void {
    shown.value = false;
    artifacts.close();
  }

  onMounted(load);
  watch([sessionId, stamp], load);
  // An artifact that appears, or is opened from its card, is what the person is shown.
  watch([artifacts.shown, artifacts.open], ([, open]) => {
    if (open) shown.value = false;
  });
  onBeforeUnmount(() => {
    stopped = true;
  });

  return { map, shown, counts, selectArtifact, toggleArtifacts, close, toggle: () => (shown.value = map.value !== null && !shown.value) };
}

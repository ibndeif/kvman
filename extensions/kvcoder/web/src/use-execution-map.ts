import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { Kvman } from '@kvman/sdk/web';
import { mapCounts, type ExecutionMapView } from './map-layout.ts';
import type { useArtifacts } from './use-artifacts.ts';

// One open chat's execution map (plan 08 §8.7, ADR 0064): the map, and whether the panel shows it in place of an
// artifact. It is read whenever the chat changes. The first read marks what is there without opening; a map that
// appears or changes later opens the panel on it, and so does an artifact: of the two, the one updated later is shown,
// whichever read answers first (ADR 0071, 2).

type Artifacts = Pick<ReturnType<typeof useArtifacts>, 'open' | 'surfaced' | 'openArtifact' | 'toggle' | 'close'>;

export function useExecutionMap(kvman: Kvman, sessionId: () => string | undefined, stamp: () => string | undefined, artifacts: Artifacts, failed: (error: unknown) => void) {
  const map = ref<ExecutionMapView | null>(null);
  const shown = ref(false);
  let current: string | undefined = undefined;
  // The map's version at the last read (`null` with no map), and when the change that opened the panel was made.
  let readVersion: number | null | undefined = undefined;
  let changedAt: string | undefined = undefined;
  let loading = 0;
  let stopped = false;

  async function load(): Promise<void> {
    const session = sessionId();
    if (session !== current) {
      current = session;
      readVersion = undefined;
      changedAt = undefined;
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
      else if (readVersion !== undefined && readVersion !== found.version) {
        changedAt = found.updatedAt;
        const artifact = artifacts.surfaced.value;
        shown.value = artifact === undefined || artifact.updatedAt < found.updatedAt;
      }
      readVersion = found === null ? null : found.version;
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
  // An artifact that showed itself takes the panel, unless the map changed after it.
  watch(artifacts.surfaced, (artifact) => {
    if (artifact !== undefined && (changedAt === undefined || changedAt <= artifact.updatedAt)) shown.value = false;
  });
  onBeforeUnmount(() => {
    stopped = true;
  });

  return { map, shown, counts, selectArtifact, toggleArtifacts, close, toggle: () => (shown.value = map.value !== null && !shown.value) };
}

import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { Kvman } from '@kvman/sdk/web';

// One open chat's artifacts (plan 08 §8.7, ADR 0009, 177 and 182): the list, the artifact the panel shows with its
// content, and whether the panel is open. The first load marks what is there without opening; every later load opens
// on an id that appears for the first time.

export type ArtifactSummary = { id: string; title: string; format: 'markdown' | 'html'; version: number; size: number; updatedAt: string };

export type ArtifactContent = { id: string; title: string; format: 'markdown' | 'html'; version: number; content: string; createdAt: string; updatedAt: string };

export function useArtifacts(kvman: Kvman, sessionId: () => string | undefined, stamp: () => string | undefined, failed: (error: unknown) => void) {
  const list = ref<ArtifactSummary[]>([]);
  const shown = ref<string | undefined>(undefined);
  const content = ref<ArtifactContent | undefined>(undefined);
  const open = ref(false);
  const seen = new Set<string>();
  let current: string | undefined = undefined;
  let firstDone = false;
  let loading = 0;
  let stopped = false;

  function reset(next: string | undefined): void {
    current = next;
    firstDone = false;
    seen.clear();
    list.value = [];
    shown.value = undefined;
    content.value = undefined;
    open.value = false;
  }

  async function fetchContent(session: string, id: string): Promise<void> {
    const summary = list.value.find((item) => item.id === id);
    if (summary === undefined) return;
    const kept = content.value;
    if (kept !== undefined && kept.id === id && kept.version === summary.version && kept.updatedAt === summary.updatedAt) return;
    try {
      const full = await kvman.exec('kvcoder.artifact.get', { sessionId: session, id });
      if (stopped || sessionId() !== session || shown.value !== id) return;
      content.value = full;
    } catch (error) {
      if (!stopped) failed(error);
    }
  }

  async function load(): Promise<void> {
    const session = sessionId();
    if (session === undefined) {
      if (current !== undefined) reset(undefined);
      return;
    }
    if (current !== session) reset(session);
    const ticket = (loading += 1);
    let summaries: ArtifactSummary[];
    try {
      summaries = await kvman.exec('kvcoder.artifact.list', { sessionId: session });
    } catch (error) {
      if (!stopped && ticket === loading) failed(error);
      return;
    }
    if (stopped || ticket !== loading || sessionId() !== session || current !== session) return;
    list.value = summaries;
    if (!firstDone) {
      firstDone = true;
      for (const item of summaries) seen.add(item.id);
      if (summaries.length === 0) {
        shown.value = undefined;
        content.value = undefined;
        open.value = false;
        return;
      }
      const first = summaries[0];
      if (first !== undefined && (shown.value === undefined || summaries.every((item) => item.id !== shown.value))) shown.value = first.id;
      const showing = shown.value;
      if (showing !== undefined) await fetchContent(session, showing);
      return;
    }
    const fresh = summaries.filter((item) => !seen.has(item.id));
    for (const item of fresh) seen.add(item.id);
    if (fresh.length > 0) {
      const newest = [...fresh].sort((left, right) => (left.updatedAt < right.updatedAt ? 1 : left.updatedAt > right.updatedAt ? -1 : 0))[0];
      if (newest !== undefined) {
        shown.value = newest.id;
        open.value = true;
        await fetchContent(session, newest.id);
      }
      return;
    }
    const showing = shown.value;
    if (showing !== undefined && summaries.every((item) => item.id !== showing)) {
      const first = summaries[0];
      if (first === undefined) {
        shown.value = undefined;
        content.value = undefined;
        open.value = false;
        return;
      }
      shown.value = first.id;
    }
    const active = shown.value;
    if (active !== undefined) await fetchContent(session, active);
  }

  function select(id: string): void {
    if (list.value.every((item) => item.id !== id)) return;
    shown.value = id;
    const session = sessionId();
    if (session !== undefined) void fetchContent(session, id);
  }

  function openArtifact(id: string): void {
    if (list.value.every((item) => item.id !== id)) return;
    shown.value = id;
    open.value = true;
    const session = sessionId();
    if (session !== undefined) void fetchContent(session, id);
  }

  function toggle(): void {
    if (open.value) {
      open.value = false;
      return;
    }
    if (list.value.length === 0) return;
    const showing = shown.value;
    if (showing === undefined || list.value.every((item) => item.id !== showing)) {
      const first = list.value[0];
      if (first === undefined) return;
      shown.value = first.id;
    }
    open.value = true;
    const session = sessionId();
    const active = shown.value;
    if (session !== undefined && active !== undefined) void fetchContent(session, active);
  }

  function close(): void {
    open.value = false;
  }

  onMounted(load);
  watch([sessionId, stamp], load);
  onBeforeUnmount(() => {
    stopped = true;
  });

  return { list, shown, content, open, select, openArtifact, toggle, close };
}

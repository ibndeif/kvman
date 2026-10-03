import type { kernelQuerySchemas, z } from '@kvman/sdk';
import { computed, ref, shallowRef, watch } from 'vue';
import { kernelCommand } from '../api/kernel.ts';
import { problemOf } from '../api/client.ts';
import { showProblem, type Kvwebui } from './kvwebui.ts';
import { listFolder, openFolder } from './workspaces.ts';

// The folder browser's state (plan 06 §6.2, ADR 0009, 220 and 222 to 225): the folder shown and its sub-folders, the
// loading state, the listings already seen, the folders visited, the filter and the highlight, and making a folder.
export type Listing = z.output<(typeof kernelQuerySchemas)['kernel.folder.list']['output']>;

const cacheLimit = 50;
const historyLimit = 50;

export function useFolderBrowser(state: Kvwebui, onOpened: () => void) {
  const listing = shallowRef<Listing | undefined>(undefined);
  const loading = ref(false);
  const reason = ref<string | undefined>(undefined);
  const hidden = ref(false);
  const filter = ref('');
  const highlighted = ref(-1);
  const visited = ref<string[]>([]);
  const creating = ref(false);
  const createReason = ref<string | undefined>(undefined);
  const cache = new Map<string, Listing>();
  let newest = 0;

  const keyOf = (path: string, withHidden = hidden.value): string => `${withHidden ? 'h' : 'v'}:${path}`;
  const folders = computed(() => {
    const words = filter.value.trim().toLowerCase();
    return (listing.value?.folders ?? []).filter((folder) => folder.name.toLowerCase().includes(words));
  });
  const openPaths = computed(() => new Set(state.workspaces.value.map((workspace) => workspace.path)));

  function remember(requested: string | undefined, found: Listing): void {
    for (const path of new Set([requested, found.path])) {
      if (path === undefined) continue;
      cache.delete(keyOf(path));
      cache.set(keyOf(path), found);
    }
    while (cache.size > cacheLimit) cache.delete(cache.keys().next().value ?? '');
  }

  const fail = (error: unknown): void => {
    const problem = problemOf(error);
    reason.value = problem.code === 'VALIDATION_FAILED' ? problem.message : undefined;
    showProblem(state, problem);
  };

  /** Shows `path`, from what was seen before at once, and reads it again; only the newest request's answer is used. */
  async function load(path: string | undefined, remembering = true): Promise<void> {
    const ticket = (newest += 1);
    const before = listing.value?.path;
    if (remembering && before !== undefined && before !== path) visited.value = [...visited.value, before].slice(-historyLimit);
    const seen = path === undefined ? undefined : cache.get(keyOf(path));
    if (seen !== undefined) listing.value = seen;
    loading.value = true;
    await listFolder(state, path, hidden.value).then(
      (found) => {
        if (ticket !== newest) return;
        remember(path, found);
        listing.value = found;
        reason.value = undefined;
      },
      (error: unknown) => {
        if (ticket === newest) fail(error);
      },
    );
    if (ticket === newest) loading.value = false;
  }

  const up = (): Promise<void> => load(listing.value?.parent ?? undefined);
  const back = (): Promise<void> => {
    const previous = visited.value.at(-1);
    visited.value = visited.value.slice(0, -1);
    return load(previous, false);
  };

  function move(step: number): void {
    if (folders.value.length === 0) return;
    highlighted.value = Math.min(Math.max(highlighted.value + step, 0), folders.value.length - 1);
  }

  const open = async (): Promise<void> => {
    if (listing.value === undefined) return;
    await openFolder(state, listing.value.path).then(onOpened, fail);
  };

  /** Makes `name` inside the folder shown and goes into it; `false` says it was refused, with the reason shown. */
  async function create(name: string): Promise<boolean> {
    if (listing.value === undefined) return false;
    const parent = listing.value.path;
    creating.value = true;
    createReason.value = undefined;
    const made = await kernelCommand(state.api, 'kernel.folder.create', { path: parent, name }).catch((error: unknown) => {
      const problem = problemOf(error);
      createReason.value = problem.code === 'VALIDATION_FAILED' ? problem.message : undefined;
      showProblem(state, problem);
      return undefined;
    });
    creating.value = false;
    if (made === undefined) return false;
    cache.delete(keyOf(parent, true));
    cache.delete(keyOf(parent, false));
    await load(made.path);
    return true;
  }

  watch(() => listing.value?.path, () => {
    filter.value = '';
    highlighted.value = -1;
  });
  watch(filter, () => (highlighted.value = filter.value === '' ? -1 : 0));
  watch(hidden, () => load(listing.value?.path, false));

  return { listing, loading, reason, hidden, filter, highlighted, visited, folders, openPaths, creating, createReason, load, up, back, move, open, create };
}

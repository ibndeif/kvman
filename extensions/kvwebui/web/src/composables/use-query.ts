import type { Json, Problem } from '@kvman/sdk';
import { ref, shallowRef, watch, type Ref, type ShallowRef } from 'vue';
import { problemOf } from '../api/client.ts';
import { useKvwebui } from '../state/kvwebui.ts';

// A query a component shows (plan 06 §6.4): it runs at once, and again after each command the UI runs, when the tab's
// workspace changes, and when `again` changes. Only the latest run's answer is kept.

export type QueryState = { data: ShallowRef<Json | undefined>; problem: ShallowRef<Problem | undefined>; loading: Ref<boolean>; rerun: () => Promise<void> };

export function useQuery(name: () => string, input: () => Json, again?: Ref<number>): QueryState {
  const state = useKvwebui();
  const data = shallowRef<Json>();
  const problem = shallowRef<Problem>();
  const loading = ref(true);
  let latest = 0;
  const rerun = async (): Promise<void> => {
    const run = ++latest;
    await state.api.query(name(), input()).then(
      (output) => {
        if (run !== latest) return;
        data.value = output;
        problem.value = undefined;
      },
      (error: unknown) => {
        if (run === latest) problem.value = problemOf(error);
      },
    );
    if (run === latest) loading.value = false;
  };
  watch([() => state.revision.value, () => state.workspace.value, () => again?.value, () => JSON.stringify(input())], rerun, { immediate: true });
  return { data, problem, loading, rerun };
}

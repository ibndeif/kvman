import { computed, onMounted, onUnmounted, ref, type ComputedRef, type Ref } from 'vue';
import { useRoute } from 'vue-router';
import { paramNames } from '../contributions/references.ts';
import type { StatusEntry } from '../contributions/registry.ts';
import { stringList } from '../state/hidden-screens.ts';
import { routePage } from '../state/navigation.ts';
import { settingValue, useKvwebui } from '../state/kvwebui.ts';

// The status items to show (plan 06 §6.2): the contributed ones that aren't hidden, without those that read a route param
// the page lacks (ADR 0009, 146), and the tick that reruns them every 30 s. The status bar and the embedded status line
// both show them.

export const statusMilliseconds = 30_000;

export type StatusItems = {
  items: ComputedRef<StatusEntry[]>;
  params: ComputedRef<Record<string, string>>;
  hidden: ComputedRef<string[]>;
  tick: Ref<number>;
};

export function useStatusItems(): StatusItems {
  const state = useKvwebui();
  const route = useRoute();
  const tick = ref(0);
  let timer: ReturnType<typeof setInterval> | undefined;
  const params = computed(() => routePage(state.registry.value, route)?.params ?? {});
  const hidden = computed(() => stringList(settingValue(state, 'kvwebui.status.hidden')));
  const items = computed(() => state.registry.value.status.filter((item) => !hidden.value.includes(item.id) && paramNames(item.input).every((name) => params.value[name] !== undefined)));
  onMounted(() => {
    timer = setInterval(() => {
      tick.value += 1;
    }, statusMilliseconds);
  });
  onUnmounted(() => clearInterval(timer));
  return { items, params, hidden, tick };
}

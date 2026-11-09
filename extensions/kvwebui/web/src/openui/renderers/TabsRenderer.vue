<script setup lang="ts">
import { useIsStreaming, type ComponentRenderProps } from '@openuidev/vue-lang';
import { computed, ref, watch } from 'vue';
import type { TabsProps } from '../definitions/layout.ts';
import { RenderedValue } from './RenderedValue.ts';

// OpenUI's Tabs (plan 06 §6.1, ADR 0124, 4): a tablist and the active item's panel. A switch is local, so it works in an
// old reply too. While a live block streams, the panel follows the item whose content grew last until the person picks.
const component = defineProps<ComponentRenderProps<TabsProps>>();
const items = computed(() => (component.props.items ?? []).filter((item) => item.props.value !== undefined));
const active = ref('');
const interacted = ref(false);
const streaming = useIsStreaming();
const sizes = computed(() => new Map(items.value.map((item) => [item.props.value, JSON.stringify(item.props.content).length])));
const activeItem = computed(() => items.value.find((item) => item.props.value === active.value));
let previous = new Map<string, number>();
let initialized = false;

watch(
  items,
  (list) => {
    if (list.length === 0) return;
    if (list.some((item) => item.props.value === active.value)) return;
    const first = list[0];
    if (first !== undefined) active.value = first.props.value;
  },
  { immediate: true },
);

watch(
  sizes,
  (next) => {
    if (!initialized) {
      previous = next;
      initialized = true;
      return;
    }
    if (!streaming.value || interacted.value) {
      previous = next;
      return;
    }
    let candidate: string | undefined;
    for (const [value, size] of next) {
      if (size > (previous.get(value) ?? 0)) candidate = value;
    }
    previous = next;
    if (candidate !== undefined && candidate !== active.value) active.value = candidate;
  },
  { immediate: true },
);

function select(value: string): void {
  interacted.value = true;
  active.value = value;
}

function onKeydown(event: KeyboardEvent): void {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const count = items.value.length;
  if (count === 0) return;
  const current = items.value.findIndex((item) => item.props.value === active.value);
  const rightToLeft = document.documentElement.dir === 'rtl';
  let next = current < 0 ? 0 : current;
  if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = count - 1;
  else if (event.key === 'ArrowRight') next = rightToLeft ? next - 1 : next + 1;
  else next = rightToLeft ? next + 1 : next - 1;
  next = (next + count) % count;
  const item = items.value[next];
  if (item === undefined) return;
  interacted.value = true;
  active.value = item.props.value;
  const tabs = event.currentTarget instanceof HTMLElement ? event.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]') : [];
  tabs[next]?.focus();
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <div role="tablist" class="flex flex-wrap gap-1 border-b border-line" @keydown="onKeydown">
      <button
        v-for="item in items"
        :key="item.props.value"
        type="button"
        role="tab"
        :aria-selected="item.props.value === active"
        :tabindex="item.props.value === active ? 0 : -1"
        class="m-0 border-0 border-b-2 bg-transparent px-3 py-1.5 text-sm"
        :class="item.props.value === active ? 'border-primary font-medium text-primary' : 'border-transparent text-muted'"
        @click="select(item.props.value)"
      >
        <span dir="auto">{{ item.props.trigger }}</span>
      </button>
    </div>
    <div v-if="activeItem" role="tabpanel" class="min-w-0">
      <RenderedValue :value="activeItem.props.content" :render-node="component.renderNode" />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ComponentRenderProps } from '@openuidev/vue-lang';
import { ChevronDown, ChevronRight } from '@lucide/vue';
import { computed, ref, watch } from 'vue';
import type { AccordionProps } from '../definitions/layout.ts';
import { RenderedValue } from './RenderedValue.ts';

// OpenUI's Accordion (plan 06 §6.1, ADR 0124, 4): one item open at a time, collapsible. Until the person presses one, a
// new item that arrives opens itself. A switch is local, so it works in an old reply too.
const component = defineProps<ComponentRenderProps<AccordionProps>>();
const items = computed(() => component.props.items ?? []);
const open = ref('');
const interacted = ref(false);
let previousCount = 0;

watch(
  () => items.value.length,
  (count) => {
    if (!interacted.value && count > previousCount) {
      const newest = items.value[count - 1];
      if (newest !== undefined) open.value = newest.props.value;
    }
    previousCount = count;
  },
  { immediate: true },
);

function toggle(value: string): void {
  interacted.value = true;
  open.value = open.value === value ? '' : value;
}
</script>

<template>
  <div class="flex flex-col divide-y divide-line border-y border-line">
    <section v-for="item in items" :key="item.props.value">
      <h3 class="m-0">
        <button
          type="button"
          class="flex w-full items-center justify-between gap-2 border-0 bg-transparent px-0 py-3 text-start text-sm font-medium"
          :aria-expanded="open === item.props.value"
          @click="toggle(item.props.value)"
        >
          <span dir="auto">{{ item.props.trigger }}</span>
          <ChevronDown v-if="open === item.props.value" class="size-4 shrink-0" aria-hidden="true" />
          <ChevronRight v-else class="size-4 shrink-0 rtl:-scale-x-100" aria-hidden="true" />
        </button>
      </h3>
      <div v-if="open === item.props.value" class="pb-3">
        <RenderedValue :value="item.props.content" :render-node="component.renderNode" />
      </div>
    </section>
  </div>
</template>

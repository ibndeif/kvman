<script setup lang="ts">
import { useIsStreaming, type ComponentRenderProps } from '@openuidev/vue-lang';
import { ChevronDown, ChevronRight } from '@lucide/vue';
import { computed, ref, watch } from 'vue';
import type { ChatSectionBlockProps } from '../definitions/chat-containers.ts';
import { RenderedValue } from './RenderedValue.ts';

// OpenUI's SectionBlock (plan 06 §6.1, ADR 0124, 4): foldable sections, several open at once. While a live block streams,
// each new section opens as it arrives; when the stream ends and the person hasn't pressed one, only the first stays open.
const component = defineProps<ComponentRenderProps<ChatSectionBlockProps>>();
const items = computed(() => component.props.sections ?? []);
const foldable = computed(() => component.props.isFoldable !== false);
const streaming = useIsStreaming();
const open = ref<string[]>([]);
const interacted = ref(false);
let previousLength = 0;
let previousStreaming = streaming.value;

watch(
  () => items.value.length,
  (length) => {
    if (length === 0) return;
    if (streaming.value && length > previousLength && !interacted.value) {
      const last = items.value[length - 1];
      const value = last?.props.value;
      if (value !== undefined && !open.value.includes(value)) open.value = [...open.value, value];
    } else if (open.value.length === 0) {
      const first = items.value[0]?.props.value;
      if (first !== undefined) open.value = [first];
    }
    previousLength = length;
  },
  { immediate: true },
);

watch(streaming, (now) => {
  if (previousStreaming && !now && !interacted.value && items.value.length > 0) {
    const first = items.value[0]?.props.value;
    open.value = first === undefined ? [] : [first];
  }
  previousStreaming = now;
});

function toggle(value: string): void {
  interacted.value = true;
  open.value = open.value.includes(value) ? open.value.filter((candidate) => candidate !== value) : [...open.value, value];
}
</script>

<template>
  <div v-if="!foldable" class="flex flex-col gap-4">
    <section v-for="(item, index) in items" :key="index">
      <h3 dir="auto" class="m-0 text-sm font-semibold">{{ item.props.trigger }}</h3>
      <div class="mt-2">
        <RenderedValue :value="item.props.content" :render-node="component.renderNode" />
      </div>
    </section>
  </div>
  <div v-else class="flex flex-col divide-y divide-line border-y border-line">
    <section v-for="(item, index) in items" :key="index">
      <h3 class="m-0">
        <button
          type="button"
          class="flex w-full items-center justify-between gap-2 border-0 bg-transparent px-0 py-3 text-start text-sm font-medium"
          :aria-expanded="open.includes(item.props.value)"
          @click="toggle(item.props.value)"
        >
          <span dir="auto">{{ item.props.trigger }}</span>
          <ChevronDown v-if="open.includes(item.props.value)" class="size-4 shrink-0" aria-hidden="true" />
          <ChevronRight v-else class="size-4 shrink-0 rtl:-scale-x-100" aria-hidden="true" />
        </button>
      </h3>
      <div v-if="open.includes(item.props.value)" class="pb-3">
        <RenderedValue :value="item.props.content" :render-node="component.renderNode" />
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { useTriggerAction, type ComponentRenderProps } from '@openuidev/vue-lang';
import { ArrowRight } from '@lucide/vue';
import { computed } from 'vue';
import type { FollowUpBlockProps } from '../definitions/follow-ups.ts';
import { useOpenuiLive } from '../presses.ts';

// OpenUI's FollowUpBlock (plan 06 §6.1, ADR 0124, 6, 14, 18): full-width suggestion buttons, each sending its text, with
// the arrow at the inline end, mirrored in Arabic.
const component = defineProps<ComponentRenderProps<FollowUpBlockProps>>();
const trigger = useTriggerAction();
const live = useOpenuiLive();
const items = computed(() => component.props.items ?? []);

function press(text: string): void {
  if (!live.value) return;
  trigger(text);
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <button
      v-for="(item, index) in items"
      :key="index"
      type="button"
      class="flex w-full items-center justify-between gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-start text-sm disabled:opacity-50"
      :disabled="!live"
      @click="press(item.props.text)"
    >
      <span dir="auto">{{ item.props.text }}</span>
      <ArrowRight class="size-4 shrink-0 text-muted rtl:-scale-x-100" aria-hidden="true" />
    </button>
  </div>
</template>

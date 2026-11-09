<script setup lang="ts">
import type { ComponentRenderProps } from '@openuidev/vue-lang';
import { computed } from 'vue';
import type { StepsProps } from '../definitions/layout-items.ts';
import MarkdownView from '../../components/views/MarkdownView.vue';

// OpenUI's Steps (plan 06 §6.1, ADR 0124, 16): a numbered vertical list with a title and Markdown details per step.
const component = defineProps<ComponentRenderProps<StepsProps>>();
const items = computed(() => component.props.items ?? []);
</script>

<template>
  <ol class="m-0 flex list-none flex-col gap-4 p-0">
    <li v-for="(item, index) in items" :key="index" class="flex gap-3">
      <span class="grid size-6 shrink-0 place-items-center rounded-full bg-neutral-soft text-xs font-semibold text-neutral-ink" aria-hidden="true">{{ index + 1 }}</span>
      <div class="min-w-0">
        <p dir="auto" class="m-0 text-sm font-semibold">{{ item.props.title }}</p>
        <div class="mt-1 text-sm">
          <MarkdownView :view="{ type: 'markdown', text: 'kvwebui.openui.markdown', params: { text: item.props.details } }" :scope="{}" />
        </div>
      </div>
    </li>
  </ol>
</template>

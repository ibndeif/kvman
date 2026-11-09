<script setup lang="ts">
import type { ComponentRenderProps } from '@openuidev/vue-lang';
import type { MarkDownRendererProps } from '../definitions/content.ts';
import MarkdownView from '../../components/views/MarkdownView.vue';

// OpenUI's MarkDownRenderer (plan 06 §6.1, ADR 0124, 16): Markdown through the sanitized Markdown view, in a clear, card,
// or sunk container.
const component = defineProps<ComponentRenderProps<MarkDownRendererProps>>();
const variants = {
  clear: '',
  card: 'rounded-xl border border-line bg-surface p-4',
  sunk: 'rounded-xl bg-sunken p-4',
};
</script>

<template>
  <div :class="variants[component.props.variant ?? 'clear']">
    <MarkdownView :view="{ type: 'markdown', text: 'kvwebui.openui.markdown', params: { text: component.props.textMarkdown } }" :scope="{}" />
  </div>
</template>

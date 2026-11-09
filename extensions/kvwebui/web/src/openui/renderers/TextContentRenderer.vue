<script setup lang="ts">
import type { ComponentRenderProps } from '@openuidev/vue-lang';
import type { TextContentProps } from '../definitions/content.ts';
import MarkdownView from '../../components/views/MarkdownView.vue';

// OpenUI's TextContent (plan 06 §6.1, ADR 0124, 16): Markdown through the sanitized Markdown view, so a script in the
// model's text never enters the page.
const component = defineProps<ComponentRenderProps<TextContentProps>>();
const sizes = { small: 'text-sm', default: 'text-base', large: 'text-lg', 'small-heavy': 'text-sm font-semibold', 'large-heavy': 'text-lg font-semibold' };
</script>

<template>
  <div :class="sizes[component.props.size ?? 'default']">
    <MarkdownView :view="{ type: 'markdown', text: 'kvwebui.openui.markdown', params: { text: component.props.text } }" :scope="{}" />
  </div>
</template>

<script setup lang="ts">
import type { Json } from '@kvman/sdk';
import DOMPurify from 'dompurify';
import MarkdownIt from 'markdown-it';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { resolveValues, textParams, type Scope } from '../../contributions/references.ts';
import type { View } from '../../contributions/views.ts';
import QueryFrame from './QueryFrame.vue';

// Markdown (plan 06 §6.1, §6.4): markdown-it with HTML off, its output sanitized by DOMPurify. This is the only place
// kvwebui renders HTML. Each block takes its direction from its own text (ADR 0013, 12), so an English answer reads left to
// right in an Arabic app, and an Arabic one right to left in an English app.
const props = defineProps<{ view: Extract<View, { type: 'markdown' }>; scope: Scope }>();
const { t } = useI18n();
const markdown = new MarkdownIt({ html: false, linkify: true });
const directedBlocks = new Set(['paragraph_open', 'heading_open', 'bullet_list_open', 'ordered_list_open', 'list_item_open', 'blockquote_open', 'table_open']);
markdown.core.ruler.push('kvwebui-direction', (state) => {
  for (const token of state.tokens) if (directedBlocks.has(token.type)) token.attrSet('dir', 'auto');
});
const render = (source: string): string => DOMPurify.sanitize(markdown.render(source));
const input = computed(() => resolveValues(props.view.input, props.scope));
const fieldOf = (data: Json): string => {
  const value = typeof data === 'object' && data !== null && !Array.isArray(data) && props.view.field !== undefined ? data[props.view.field] : undefined;
  return typeof value === 'string' ? value : '';
};
</script>

<template>
  <div v-if="props.view.text !== undefined" class="kvwebui-markdown" data-test="markdown" v-html="render(t(props.view.text, textParams(props.view.params, props.scope)))" />
  <QueryFrame v-else v-slot="{ data }" :query="props.view.query ?? ''" :input="input">
    <div class="kvwebui-markdown" data-test="markdown" v-html="render(fieldOf(data))" />
  </QueryFrame>
</template>

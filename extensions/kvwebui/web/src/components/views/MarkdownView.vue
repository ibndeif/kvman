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
// kvwebui renders HTML.
const props = defineProps<{ view: Extract<View, { type: 'markdown' }>; scope: Scope }>();
const { t } = useI18n();
const markdown = new MarkdownIt({ html: false, linkify: true });
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

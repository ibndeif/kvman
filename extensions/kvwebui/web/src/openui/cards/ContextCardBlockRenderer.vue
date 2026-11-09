<script setup lang="ts">
import type { ComponentRenderProps } from '@openuidev/vue-lang';
import { computed } from 'vue';
import MarkdownView from '../../components/views/MarkdownView.vue';
import type { ContextCardBlockProps } from '../definitions/cards.ts';
import OpenuiImage from '../renderers/OpenuiImage.vue';
import { RenderedValue } from '../renderers/RenderedValue.ts';
import CardBlock from './CardBlock.vue';

// OpenUI's ContextCardBlock (plan 06 §6.1, ADR 0124, 7, 16): a title or tag, a Markdown body, a gray tint or a picture on
// top; a card's label is its title's text.
const component = defineProps<ComponentRenderProps<ContextCardBlockProps>>();
const items = computed(() => (component.props.items ?? []).map((item) => item.props));
const titleOf = (item: (typeof items.value)[number]): string => (typeof item.title === 'string' ? item.title : item.title.props.text);
</script>

<template>
  <CardBlock v-slot="{ item }" :items="items" :label="(item, index) => titleOf(item) || item.id || `Card ${index + 1}`" :action="component.props.action" :carousel="component.props.layout === 'carousel'" :surface="(item) => (item.bgColor === 'gray' ? 'bg-sunken' : 'bg-surface')">
    <OpenuiImage v-if="item.bgImageSrc !== undefined" class="h-24 w-full rounded-lg object-cover" :src="item.bgImageSrc" :alt="item.bgImageAlt ?? ''" />
    <span v-if="typeof item.title === 'string'" dir="auto" class="text-sm font-semibold">{{ item.title }}</span>
    <RenderedValue v-else :value="item.title" :render-node="component.renderNode" />
    <MarkdownView v-if="item.body !== undefined" :view="{ type: 'markdown', text: 'kvwebui.openui.markdown', params: { text: item.body } }" :scope="{}" />
  </CardBlock>
</template>

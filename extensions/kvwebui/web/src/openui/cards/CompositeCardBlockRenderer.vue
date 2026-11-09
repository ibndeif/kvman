<script setup lang="ts">
import type { ComponentRenderProps } from '@openuidev/vue-lang';
import { computed } from 'vue';
import type { CompositeCardBlockProps } from '../definitions/cards.ts';
import { RenderedValue } from '../renderers/RenderedValue.ts';
import CardBlock from './CardBlock.vue';

// OpenUI's CompositeCardBlock (plan 06 §6.1, ADR 0124, 16): a header, a stack of body parts, and a footer with a price
// and a button; a card's label is its header's title or image text.
const component = defineProps<ComponentRenderProps<CompositeCardBlockProps>>();
const items = computed(() => (component.props.items ?? []).map((item) => item.props));
const headerText = (item: (typeof items.value)[number]): string => {
  const header = item.header?.props;
  if (header === undefined) return '';
  if ('title' in header) return header.title;
  if ('value' in header) return header.value;
  return header.alt;
};
</script>

<template>
  <CardBlock v-slot="{ item }" :items="items" :label="(item, index) => headerText(item) || item.id || `Card ${index + 1}`" :action="component.props.action" :carousel="component.props.layout === 'carousel'">
    <RenderedValue v-if="item.header !== undefined" :value="item.header" :render-node="component.renderNode" />
    <RenderedValue v-for="(part, index) in item.body ?? []" :key="index" :value="part" :render-node="component.renderNode" />
    <span v-if="item.footer !== undefined" class="mt-auto flex items-center justify-between gap-3 border-t border-line pt-2">
      <RenderedValue v-if="item.footer.price !== undefined" :value="item.footer.price" :render-node="component.renderNode" />
      <RenderedValue v-if="item.footer.button !== undefined" :value="item.footer.button" :render-node="component.renderNode" />
    </span>
  </CardBlock>
</template>

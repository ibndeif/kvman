<script setup lang="ts">
import type { ComponentRenderProps } from '@openuidev/vue-lang';
import { computed } from 'vue';
import type { OverviewCardBlockProps } from '../definitions/cards.ts';
import { RenderedValue } from '../renderers/RenderedValue.ts';
import CardBlock from './CardBlock.vue';

// OpenUI's OverviewCardBlock (plan 06 §6.1, ADR 0124, 16): a heading on top and an inline metric below; a card's label
// is its heading's title or value.
const component = defineProps<ComponentRenderProps<OverviewCardBlockProps>>();
const items = computed(() => (component.props.items ?? []).map((item) => item.props));
const heading = (item: (typeof items.value)[number]): string => ('title' in item.top.props ? item.top.props.title : item.top.props.value);
</script>

<template>
  <CardBlock v-slot="{ item }" :items="items" :label="(item, index) => heading(item) || item.id || `Card ${index + 1}`" :action="component.props.action" :carousel="component.props.layout === 'carousel'">
    <RenderedValue :value="item.top" :render-node="component.renderNode" />
    <RenderedValue v-if="item.bottom !== undefined" :value="item.bottom" :render-node="component.renderNode" />
  </CardBlock>
</template>

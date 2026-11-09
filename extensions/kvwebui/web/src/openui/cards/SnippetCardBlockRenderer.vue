<script setup lang="ts">
import type { ComponentRenderProps } from '@openuidev/vue-lang';
import { computed } from 'vue';
import type { SnippetCardBlockProps } from '../definitions/cards.ts';
import { RenderedValue } from '../renderers/RenderedValue.ts';
import CardBlock from './CardBlock.vue';

// OpenUI's SnippetCardBlock (plan 06 §6.1, ADR 0124, 16): compact cards, a label at the inline start and a value at
// the inline end; a card's label is its left part's title.
const component = defineProps<ComponentRenderProps<SnippetCardBlockProps>>();
const items = computed(() => (component.props.items ?? []).map((item) => item.props));
</script>

<template>
  <CardBlock v-slot="{ item }" :items="items" :label="(item, index) => item.lhs.props.title || item.id || `Card ${index + 1}`" :action="component.props.action" :carousel="false">
    <span class="flex items-center justify-between gap-3">
      <RenderedValue :value="item.lhs" :render-node="component.renderNode" />
      <RenderedValue v-if="item.rhs !== undefined" :value="item.rhs" :render-node="component.renderNode" />
    </span>
  </CardBlock>
</template>

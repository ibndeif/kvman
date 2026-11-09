<script setup lang="ts">
import type { ComponentRenderProps } from '@openuidev/vue-lang';
import { computed } from 'vue';
import type { VisualCardBlockProps } from '../definitions/cards.ts';
import OpenuiImage from '../renderers/OpenuiImage.vue';
import { RenderedValue } from '../renderers/RenderedValue.ts';
import CardBlock from './CardBlock.vue';

// OpenUI's VisualCardBlock (plan 06 §6.1, ADR 0124, 7, 16): a picture with its tag on top and a bold panel below; a
// card's label is its body's text, or else its tag's.
const component = defineProps<ComponentRenderProps<VisualCardBlockProps>>();
const items = computed(() => (component.props.items ?? []).map((item) => item.props));
</script>

<template>
  <CardBlock v-slot="{ item }" :items="items" :label="(item, index) => item.body.props.value || item.tag?.props.text || item.id || `Card ${index + 1}`" :action="component.props.action" :carousel="component.props.layout === 'carousel'">
    <span class="relative block">
      <OpenuiImage v-if="item.bgImageSrc !== undefined" class="h-36 w-full rounded-lg object-cover" :src="item.bgImageSrc" :alt="item.bgImageAlt ?? ''" />
      <span v-if="item.tag !== undefined" class="absolute start-2 top-2"><RenderedValue :value="item.tag" :render-node="component.renderNode" /></span>
    </span>
    <RenderedValue :value="item.body" :render-node="component.renderNode" />
  </CardBlock>
</template>

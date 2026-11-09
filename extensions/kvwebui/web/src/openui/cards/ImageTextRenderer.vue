<script setup lang="ts">
import type { ComponentRenderProps } from '@openuidev/vue-lang';
import type { ImageTextProps } from '../definitions/card-parts.ts';
import OpenuiImage from '../renderers/OpenuiImage.vue';

// OpenUI's ImageText (plan 06 §6.1, ADR 0124, 7, 16): a small square image with a title and a subtitle, side by side or
// stacked; `imageSize` is its side in pixels (40 by default).
const component = defineProps<ComponentRenderProps<ImageTextProps>>();
</script>

<template>
  <span class="flex gap-2" :class="component.props.layout === 'vertical' ? 'flex-col items-start' : 'items-center'">
    <OpenuiImage class="shrink-0 rounded-lg object-cover" :style="{ inlineSize: `${component.props.imageSize ?? 40}px`, blockSize: `${component.props.imageSize ?? 40}px` }" :src="component.props.src" :alt="component.props.alt ?? ''" />
    <span class="flex min-w-0 flex-col">
      <span dir="auto" class="text-sm" :class="component.props.bold === true ? 'font-semibold' : 'font-medium'">{{ component.props.title }}</span>
      <span v-if="component.props.subtitle !== undefined" dir="auto" class="text-xs text-muted">{{ component.props.subtitle }}</span>
    </span>
  </span>
</template>

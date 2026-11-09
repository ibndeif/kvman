<script setup lang="ts">
import type { ComponentRenderProps } from '@openuidev/vue-lang';
import type { ImageTextLargeProps } from '../definitions/card-parts.ts';
import OpenuiImage from '../renderers/OpenuiImage.vue';

// OpenUI's ImageTextLarge (plan 06 §6.1, ADR 0124, 7, 16): a full-width banner image above a title and a subtitle.
const component = defineProps<ComponentRenderProps<ImageTextLargeProps>>();
</script>

<template>
  <span class="flex flex-col gap-2">
    <OpenuiImage class="h-32 w-full rounded-lg object-cover" :src="component.props.src" :alt="component.props.alt ?? ''" />
    <span dir="auto" class="text-base font-semibold">{{ component.props.title }}</span>
    <span v-if="component.props.subtitle !== undefined" dir="auto" class="text-sm text-muted">{{ component.props.subtitle }}</span>
  </span>
</template>

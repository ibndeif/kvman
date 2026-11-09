<script setup lang="ts">
import type { ComponentRenderProps } from '@openuidev/vue-lang';
import type { ImageBlockProps } from '../definitions/media.ts';
import OpenuiImage from './OpenuiImage.vue';

// OpenUI's ImageBlock (plan 06 §6.1, ADR 0124, 7): a full-width image, with a soft frame while it loads.
const component = defineProps<ComponentRenderProps<ImageBlockProps>>();
</script>

<template>
  <figure class="m-0 w-full overflow-hidden rounded-xl bg-sunken">
    <OpenuiImage class="w-full" :src="component.props.src" :alt="component.props.alt ?? ''" />
  </figure>
</template>

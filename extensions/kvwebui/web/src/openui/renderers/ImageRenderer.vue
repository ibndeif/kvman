<script setup lang="ts">
import type { ComponentRenderProps } from '@openuidev/vue-lang';
import type { ImageProps } from '../definitions/media.ts';
import OpenuiImage from './OpenuiImage.vue';

// OpenUI's Image (plan 06 §6.1, ADR 0124, 7): an image with its alternative text.
const component = defineProps<ComponentRenderProps<ImageProps>>();
</script>

<template>
  <OpenuiImage :src="component.props.src ?? ''" :alt="component.props.alt" />
</template>

<script setup lang="ts">
import type { ComponentRenderProps } from '@openuidev/vue-lang';
import type { TextProps } from '../definitions/card-parts.ts';
import CardLine from './CardLine.vue';

// OpenUI's Text (plan 06 §6.1, ADR 0124, 16).
const component = defineProps<ComponentRenderProps<TextProps>>();
</script>

<template>
  <CardLine :line="component.props" :bold="false" />
</template>

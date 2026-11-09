<script setup lang="ts">
import type { ComponentRenderProps } from '@openuidev/vue-lang';
import type { CardProps } from '../definitions/card.ts';
import { flexStyle } from './flex-style.ts';
import { RenderedValue } from './RenderedValue.ts';

// OpenUI's Card (plan 06 §6.1, ADR 0124, 16): a full-width flex container with three surfaces.
const component = defineProps<ComponentRenderProps<CardProps>>();
const surfaces = { card: 'border border-line bg-surface', sunk: 'bg-sunken', clear: 'border border-transparent bg-transparent' };
</script>

<template>
  <section
    class="w-full rounded-xl p-4"
    :class="surfaces[component.props.variant ?? 'card']"
    :style="{ ...flexStyle(component.props, { align: 'stretch', justify: 'start', wrap: 'nowrap' }), flex: '1 1 0%', minWidth: 0 }"
  >
    <RenderedValue :value="component.props.children" :render-node="component.renderNode" />
  </section>
</template>

<script setup lang="ts">
import type { ComponentRenderProps } from '@openuidev/vue-lang';
import type { ButtonsProps } from '../definitions/buttons.ts';
import { RenderedValue } from './RenderedValue.ts';

// OpenUI's Buttons (plan 06 §6.1, ADR 0124): a row or a column of Button components.
const component = defineProps<ComponentRenderProps<ButtonsProps>>();
</script>

<template>
  <div class="flex gap-2" :style="{ display: 'flex', flexDirection: component.props.direction === 'column' ? 'column' : 'row', flexWrap: 'wrap', gap: '8px' }">
    <RenderedValue :value="component.props.buttons" :render-node="component.renderNode" />
  </div>
</template>

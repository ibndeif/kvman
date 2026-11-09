<script setup lang="ts">
import type { ComponentRenderProps } from '@openuidev/vue-lang';
import type { StackProps } from '../definitions/layout.ts';
import { flexStyle } from './flex-style.ts';
import { RenderedValue } from './RenderedValue.ts';

// OpenUI's Stack (plan 06 §6.1, ADR 0124, 16): a flex container whose spacing and alignment follow OpenUI's names.
const component = defineProps<ComponentRenderProps<StackProps>>();
</script>

<template>
  <div class="kvwebui-openui-stack" :style="flexStyle(component.props, { wrapBetweenStart: true })">
    <RenderedValue :value="component.props.children" :render-node="component.renderNode" />
  </div>
</template>

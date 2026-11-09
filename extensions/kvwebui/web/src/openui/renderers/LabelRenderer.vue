<script setup lang="ts">
import type { ComponentRenderProps } from '@openuidev/vue-lang';
import type { LabelProps } from '../definitions/forms.ts';

// OpenUI's Label (plan 06 §6.1, ADR 0124, 16): a short text label.
const component = defineProps<ComponentRenderProps<LabelProps>>();
</script>

<template>
  <span dir="auto" class="text-sm font-medium">{{ component.props.text }}</span>
</template>

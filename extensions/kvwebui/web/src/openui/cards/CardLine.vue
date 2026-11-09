<script setup lang="ts">
import { computed } from 'vue';
import type { TextProps } from '../definitions/card-parts.ts';

// OpenUI's Text and BoldText (plan 06 §6.1, ADR 0124, 16): a line with an optional subtext; a number reads left to
// right in tabular figures, and a metric subtext that starts with + or - is green or red, as OpenUI's are.
const props = defineProps<{ line: TextProps; bold: boolean }>();
const sizes = { xs: 'text-xs', sm: 'text-sm', md: 'text-base', lg: 'text-lg' };
const numeric = (variant: string | undefined): boolean => variant === 'number' || variant === 'metric';
const tone = computed(() => {
  const subtext = props.line.subtext?.trim() ?? '';
  if (props.line.subtextVariant !== 'metric') return 'text-muted';
  return subtext.startsWith('+') ? 'text-success-ink' : subtext.startsWith('-') ? 'text-danger-ink' : 'text-muted';
});
</script>

<template>
  <span class="flex flex-col">
    <span :class="[sizes[props.line.size ?? 'sm'], props.bold ? 'font-semibold' : '', numeric(props.line.variant) ? 'tabular-nums' : '']" :dir="numeric(props.line.variant) ? 'ltr' : 'auto'">{{ props.line.value }}</span>
    <span v-if="props.line.subtext !== undefined" class="text-xs" :class="[tone, numeric(props.line.subtextVariant) ? 'tabular-nums' : '']" :dir="numeric(props.line.subtextVariant) ? 'ltr' : 'auto'">{{ props.line.subtext }}</span>
  </span>
</template>

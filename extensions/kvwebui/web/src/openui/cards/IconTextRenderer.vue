<script setup lang="ts">
import type { ComponentRenderProps } from '@openuidev/vue-lang';
import type { IconTextProps } from '../definitions/card-parts.ts';
import OpenuiIcon from '../renderers/OpenuiIcon.vue';

// OpenUI's IconText (plan 06 §6.1, ADR 0124, 8, 16): an icon badge in its tone and size, with a title and a subtitle,
// side by side or stacked.
const component = defineProps<ComponentRenderProps<IconTextProps>>();
const tones = {
  neutral: 'bg-neutral-soft text-neutral-ink',
  info: 'bg-accent-soft text-accent-ink',
  success: 'bg-success-soft text-success-ink',
  warning: 'bg-warning-soft text-warning-ink',
  danger: 'bg-danger-soft text-danger-ink',
  inverted: 'bg-ink text-surface',
  filled: 'bg-primary text-on-primary',
  soft: 'bg-sunken text-ink',
};
const sizes = { xs: 'size-6 text-xs', s: 'size-7 text-sm', sm: 'size-7 text-sm', m: 'size-8 text-base', md: 'size-8 text-base', l: 'size-10 text-lg', lg: 'size-10 text-lg', xl: 'size-12 text-xl' };
</script>

<template>
  <span class="flex gap-2" :class="component.props.layout === 'vertical' ? 'flex-col items-start' : 'items-center'">
    <span class="grid shrink-0 place-items-center rounded-lg" :class="[tones[component.props.iconVariant ?? 'neutral'], sizes[component.props.iconSize ?? 'm']]">
      <OpenuiIcon :name="component.props.icon.props.name" :category="component.props.icon.props.category" />
    </span>
    <span class="flex min-w-0 flex-col">
      <span dir="auto" class="text-sm" :class="component.props.bold === true ? 'font-semibold' : 'font-medium'">{{ component.props.title }}</span>
      <span v-if="component.props.subtitle !== undefined" dir="auto" class="text-xs text-muted">{{ component.props.subtitle }}</span>
    </span>
  </span>
</template>

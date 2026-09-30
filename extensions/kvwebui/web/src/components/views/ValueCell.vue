<script setup lang="ts">
import type { Json } from '@kvman/sdk';
import { Check, Minus } from '@lucide/vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { formatValue, searchText } from '../../display/formats.ts';
import type { Column, Tone } from '../../contributions/views.ts';
import { useKvwebui } from '../../state/kvwebui.ts';

// One value of a table column or detail field (plan 06 §6.4, ADR 0009, 75–76): a badge when `badges` maps it (and
// nothing when it doesn't), a mark for `boolean`, or the formatted text; `secondary` shows under it.
const props = defineProps<{ row: Record<string, Json>; column: Column }>();
const state = useKvwebui();
const { t } = useI18n();
const tones: Record<Tone, string> = {
  neutral: 'bg-neutral-soft text-neutral-ink',
  info: 'bg-accent-soft text-accent-ink',
  success: 'bg-success-soft text-success-ink',
  warning: 'bg-warning-soft text-warning-ink',
  danger: 'bg-danger-soft text-danger-ink',
};
const value = computed(() => props.row[props.column.field]);
const badge = computed(() => (props.column.badges === undefined ? undefined : props.column.badges[searchText(value.value)]));
const secondary = computed(() => (props.column.secondary === undefined ? undefined : props.row[props.column.secondary]));
</script>

<template>
  <div class="flex flex-col">
    <template v-if="props.column.badges !== undefined">
      <span v-if="badge" class="inline-flex h-6 w-fit items-center rounded-full px-2.5 text-xs font-medium" :class="tones[badge.tone]" data-test="badge">{{ t(badge.text) }}</span>
    </template>
    <span v-else-if="props.column.format === 'boolean'" class="inline-flex">
      <Check v-if="value === true" class="size-4.5 text-success-ink" aria-hidden="true" />
      <Minus v-else class="size-4.5 text-muted" aria-hidden="true" />
      <span class="sr-only">{{ t(value === true ? 'kvwebui.yes' : 'kvwebui.no') }}</span>
    </span>
    <span v-else :class="props.column.secondary ? 'font-medium' : ''">{{ formatValue(value, props.column.format ?? 'text', state.language.value) }}</span>
    <span v-if="secondary !== undefined" class="font-mono text-xs text-muted"><bdi>{{ formatValue(secondary, 'text', state.language.value) }}</bdi></span>
  </div>
</template>

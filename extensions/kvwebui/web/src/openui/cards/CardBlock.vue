<script setup lang="ts" generic="Item">
import { useFormName, useTriggerAction, type ActionConfig } from '@openuidev/vue-lang';
import { useOpenuiLive, withCardLabel } from '../presses.ts';

// The layout of OpenUI's card blocks (plan 06 §6.1, ADR 0124, 14, 16): cards two per row, or side by side in a row that
// scrolls; with the block's action, each card is a button whose press sends that action with the card's label, only
// while the block is live.
const props = defineProps<{ items: readonly Item[]; label: (item: Item, index: number) => string; action: unknown; carousel: boolean; surface?: (item: Item) => string }>();
defineSlots<{ default(scope: { item: Item; index: number }): unknown }>();
const trigger = useTriggerAction();
const formName = useFormName();
const live = useOpenuiLive();

function press(item: Item, index: number): void {
  if (!live.value || props.action === undefined) return;
  const label = props.label(item, index);
  const action: ActionConfig | undefined = withCardLabel(props.action, label) as ActionConfig | undefined;
  trigger(label, formName?.value, action);
}
</script>

<template>
  <div :class="props.carousel ? 'flex snap-x gap-3 overflow-x-auto pb-1' : 'grid grid-cols-1 gap-3 sm:grid-cols-2'" data-test="card-block">
    <component
      :is="props.action === undefined ? 'div' : 'button'"
      v-for="(item, index) in props.items"
      :key="index"
      :type="props.action === undefined ? undefined : 'button'"
      :disabled="props.action === undefined ? undefined : !live"
      class="m-0 flex min-w-0 flex-col gap-2 rounded-xl border border-line p-3 text-start text-ink disabled:opacity-50"
      :class="[props.carousel ? 'w-60 shrink-0 snap-start' : '', props.surface?.(item) ?? 'bg-surface']"
      data-test="card"
      @click="press(item, index)"
    >
      <slot :item="item" :index="index" />
    </component>
  </div>
</template>

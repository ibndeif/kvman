<script setup lang="ts">
import { computed } from 'vue';
import { formatCost, useKvman } from './kvman.ts';
import { phaseOf, type Live } from './live-step.ts';
import { useNow } from './use-now.ts';

// What the running step is doing (plan 08 §8.7, ADR 0009, 142): waiting for the model, thinking, writing, or the tool
// calls with the description and the connector command the model gave each, preparing or running. The seconds come from the page's clock.
// The turn's steps and estimated cost so far follow it, as its last finished step left them (ADR 0060, 3).
const props = defineProps<{ live: Live; turn?: { steps: number; usage: { cost: number } } | undefined }>();
const kvman = useKvman();
const now = useNow();

const phase = computed(() => phaseOf(props.live));
const soFar = computed(() => {
  if (props.turn === undefined || props.turn.steps === 0) return undefined;
  if (props.turn.usage.cost === 0) return kvman.t('kvcoder.ui.turnSteps', { steps: props.turn.steps });
  return kvman.t('kvcoder.ui.turnSoFar', { steps: props.turn.steps, cost: formatCost(props.turn.usage.cost) });
});
const seconds = computed(() => Math.max(0, Math.floor((now.value - props.live.startedAt) / 1000)));
</script>

<template>
  <div class="kvc-activity" role="status" aria-live="polite" :data-phase="phase" data-test="activity">
    <span class="kvc-spin" aria-hidden="true" />
    <span class="kvc-activity-text">
      <template v-if="props.live.calls.length > 0">
        <span v-for="(call, index) in props.live.calls" :key="index" class="kvc-activity-call" data-test="activity-call">
          <span style="font-weight: 600" data-test="activity-title">{{ call.description ?? kvman.t('kvcoder.ui.activity.preparing') }}</span>
          <span v-if="call.label" class="kvc-muted" dir="ltr" data-test="activity-label">{{ call.label }}</span>
        </span>
      </template>
      <span v-else style="font-weight: 500" data-test="activity-title">{{ kvman.t(`kvcoder.ui.activity.${phase}`, props.live.retry ?? {}) }}</span>
    </span>
    <span v-if="props.live.calls.length > 0" class="kvc-muted" data-test="activity-phase">{{ kvman.t(`kvcoder.ui.activity.${phase}`) }}</span>
    <span v-if="soFar" class="kvc-muted" data-test="activity-turn">{{ soFar }}</span>
    <span class="kvc-muted" data-test="activity-seconds">{{ kvman.t('kvcoder.ui.seconds', { count: seconds }) }}</span>
  </div>
</template>

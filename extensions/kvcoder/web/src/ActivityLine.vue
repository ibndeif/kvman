<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useKvman } from './kvman.ts';
import { phaseOf, type Live } from './live-step.ts';

// What the running step is doing (plan 08 §8.7, ADR 0009, 142): waiting for the model, thinking, writing, or the tool
// calls with the title and description the model gave each, preparing or running. The seconds come from the page's clock.
const props = defineProps<{ live: Live }>();
const kvman = useKvman();
const now = ref(Date.now());
let ticker: ReturnType<typeof setInterval> | undefined;
onMounted(() => (ticker = setInterval(() => (now.value = Date.now()), 1000)));
onBeforeUnmount(() => clearInterval(ticker));

const phase = computed(() => phaseOf(props.live));
const seconds = computed(() => Math.max(0, Math.floor((now.value - props.live.startedAt) / 1000)));
</script>

<template>
  <div class="kvc-activity" role="status" aria-live="polite" :data-phase="phase" data-test="activity">
    <span class="kvc-spin" aria-hidden="true" />
    <span class="kvc-activity-text">
      <template v-if="props.live.calls.length > 0">
        <span v-for="(call, index) in props.live.calls" :key="index" class="kvc-activity-call" data-test="activity-call">
          <span style="font-weight: 600" data-test="activity-title">{{ call.title ?? kvman.t('kvcoder.ui.activity.preparing') }}</span>
          <span v-if="call.description" class="kvc-muted" data-test="activity-description">{{ call.description }}</span>
        </span>
      </template>
      <span v-else style="font-weight: 500" data-test="activity-title">{{ kvman.t(`kvcoder.ui.activity.${phase}`, props.live.retry ?? {}) }}</span>
    </span>
    <span v-if="props.live.calls.length > 0" class="kvc-muted" data-test="activity-phase">{{ kvman.t(`kvcoder.ui.activity.${phase}`) }}</span>
    <span class="kvc-muted" data-test="activity-seconds">{{ kvman.t('kvcoder.ui.seconds', { count: seconds }) }}</span>
  </div>
</template>

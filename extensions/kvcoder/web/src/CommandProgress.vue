<script setup lang="ts">
import { computed } from 'vue';
import { useKvman } from './kvman.ts';
import { useNow } from './use-now.ts';
import type { Working } from './use-session-actions.ts';

// A chat action that is running (ADR 0019, 1 and 2): what it is doing and for how long, in the running step's line.
const props = defineProps<{ working: Working }>();
const kvman = useKvman();
const now = useNow();
const seconds = computed(() => Math.max(0, Math.floor((now.value - props.working.startedAt) / 1000)));
</script>

<template>
  <div class="kvc-activity" role="status" aria-live="polite" :data-command="props.working.name" data-test="command-progress">
    <span class="kvc-spin" aria-hidden="true" />
    <span class="kvc-activity-text"><span style="font-weight: 500" data-test="command-title">{{ kvman.t(`kvcoder.ui.working.${props.working.name}`) }}</span></span>
    <span class="kvc-muted" data-test="command-seconds">{{ kvman.t('kvcoder.ui.seconds', { count: seconds }) }}</span>
  </div>
</template>

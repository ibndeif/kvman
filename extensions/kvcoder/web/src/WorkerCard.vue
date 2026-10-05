<script setup lang="ts">
import { Bot } from '@lucide/vue';
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { toastProblem, useKvman } from './kvman.ts';
import { elapsed, type Job } from './use-jobs.ts';

// A program worker's run the turn waits on (plan 08 §8.7, ADR 0021, 14): the worker, what the call said it does,
// how long it has run, and Stop. Its answer then shows as the call's own card.
const props = defineProps<{ sessionId: string; runId: string }>();
const kvman = useKvman();
const run = ref<Job>();
const now = ref(Date.now());
const stopping = ref(false);
let timer: ReturnType<typeof setInterval> | undefined;

onMounted(async () => {
  timer = setInterval(() => (now.value = Date.now()), 1000);
  try {
    run.value = await kvman.exec('kvcoder.job.get', { sessionId: props.sessionId, id: props.runId });
  } catch (error) {
    toastProblem(kvman, error);
  }
});
onBeforeUnmount(() => clearInterval(timer));

async function stop(): Promise<void> {
  stopping.value = true;
  try {
    await kvman.exec('kvcoder.job.cancel', { sessionId: props.sessionId, id: props.runId });
  } catch (error) {
    toastProblem(kvman, error);
  }
  stopping.value = false;
}
</script>

<template>
  <section v-if="run !== undefined" class="kvc-card" data-test="worker-card" :aria-label="run.title">
    <div class="kvc-card-row">
      <Bot :size="18" aria-hidden="true" />
      <span class="kvc-chip kvc-mono" data-test="worker-card-name">{{ run.title }}</span>
      <span style="flex: 1 1 auto; font-weight: 500" dir="auto" data-test="worker-card-call">{{ run.call }}</span>
      <span class="kvc-spin" />
      <span class="kvc-chip" data-test="worker-card-time">{{ kvman.t('kvcoder.ui.jobs.status.running') }} · {{ elapsed(kvman.t, now - Date.parse(run.startedAt)) }}</span>
      <button type="button" class="kvc-button" :disabled="stopping" data-test="worker-card-stop" @click="stop">{{ kvman.t('kvcoder.ui.jobs.stop') }}</button>
    </div>
  </section>
</template>

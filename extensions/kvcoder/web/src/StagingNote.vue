<script setup lang="ts">
import { GitBranch } from '@lucide/vue';
import { onMounted, ref } from 'vue';
import { toastProblem, useKvman } from './kvman.ts';
import type { Job } from './use-jobs.ts';

// What a program worker's run changed in the Git staging area (plan 08 §8.7; ADR 0060, 4): how many staged paths
// differ, and "Restore staging" while it can be put back. A run that moved HEAD says that it can't be, and has no button.
const props = defineProps<{ sessionId: string; runId: string; staging?: Job['staging'] }>();
const kvman = useKvman();
const staging = ref(props.staging);
const restoring = ref(false);

onMounted(async () => {
  if (staging.value !== undefined) return;
  try {
    staging.value = (await kvman.exec('kvcoder.job.get', { sessionId: props.sessionId, id: props.runId })).staging;
  } catch (error) {
    toastProblem(kvman, error);
  }
});

async function restore(): Promise<void> {
  if (staging.value === undefined) return;
  restoring.value = true;
  try {
    await kvman.exec('kvcoder.delegate.staging.restore', { sessionId: props.sessionId, runId: props.runId });
    staging.value = { ...staging.value, state: 'restored' };
  } catch (error) {
    toastProblem(kvman, error);
  }
  restoring.value = false;
}
</script>

<template>
  <div v-if="staging !== undefined" class="kvc-card kvc-card-row" role="note" data-test="staging-note" :data-state="staging.state">
    <GitBranch :size="18" aria-hidden="true" />
    <span style="flex: 1 1 auto">
      <template v-if="staging.state === 'restored'">{{ kvman.t('kvcoder.ui.staging.restored') }}</template>
      <template v-else>
        <span v-if="staging.paths > 0" data-test="staging-changed">{{ kvman.t('kvcoder.ui.staging.changed', { paths: staging.paths }) }}</span>
        <span v-if="staging.headMoved" data-test="staging-head-moved"> {{ kvman.t('kvcoder.ui.staging.headMoved') }}</span>
      </template>
    </span>
    <button v-if="staging.state === 'changed' && !staging.headMoved" type="button" class="kvc-button" :disabled="restoring" data-test="staging-restore" @click="restore">{{ kvman.t('kvcoder.ui.staging.restore') }}</button>
  </div>
</template>

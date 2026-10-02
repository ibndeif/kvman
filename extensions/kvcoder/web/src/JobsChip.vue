<script setup lang="ts">
import { ChevronDown } from '@lucide/vue';
import { onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue';
import JobItem from './JobItem.vue';
import { useKvman } from './kvman.ts';
import { useJobs } from './use-jobs.ts';

// The Running chip (plan 08 §8.7, ADR 0009, 153): `● 2 running` while the chat has background jobs running, opening a
// list of its jobs. It stays while the list is open, so a job that ends shows how.
const props = defineProps<{ sessionId: string; stamp: string }>();
const kvman = useKvman();
const open = ref(false);
const trigger = useTemplateRef<HTMLButtonElement>('trigger');
const { jobs, running, logs, stopping, now, load, toggleLogs, stop } = useJobs(kvman, () => props.sessionId, open);

function close(): void {
  open.value = false;
  trigger.value?.focus();
}

function outside(event: Event): void {
  if (event.target instanceof Node && !trigger.value?.parentElement?.contains(event.target)) open.value = false;
}

onMounted(load);
watch(() => [props.sessionId, props.stamp], load);
watch(open, (isOpen) => (isOpen ? document.addEventListener('pointerdown', outside) : document.removeEventListener('pointerdown', outside)));
onBeforeUnmount(() => document.removeEventListener('pointerdown', outside));
</script>

<template>
  <div v-if="running.length > 0 || open" class="kvc-jobs" data-test="jobs">
    <button ref="trigger" type="button" class="kvc-button" aria-haspopup="dialog" :aria-expanded="open" data-test="jobs-chip" @click="open ? close() : (open = true)">
      <span class="kvc-dot" aria-hidden="true" />{{ kvman.t('kvcoder.ui.jobs.running', { count: running.length }) }}<ChevronDown :size="16" aria-hidden="true" />
    </button>
    <div v-if="open" class="kvc-popover kvc-jobs-panel" role="dialog" :aria-label="kvman.t('kvcoder.ui.jobs.title')" data-test="jobs-popover" @keydown.esc.stop="close">
      <JobItem v-for="job in jobs" :key="job.id" :job="job" :now="now" :logs="logs[job.id]" :stopping="stopping.has(job.id)" @stop="stop(job.id)" @logs="toggleLogs(job.id)" />
    </div>
  </div>
</template>

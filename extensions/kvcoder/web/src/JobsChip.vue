<script setup lang="ts">
import { ChevronDown, Layers } from '@lucide/vue';
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue';
import JobItem from './JobItem.vue';
import { useKvman } from './kvman.ts';
import { useJobs } from './use-jobs.ts';

// The Running chip (plan 08 §8.7, ADR 0009, 153): `● 2 running` while the chat has background jobs running, opening a
// list of its jobs. It stays while the list is open, so a job that ends shows how; once they have all ended it is a quiet
// `Background (N)`, so an ended process can be run again (ADR 0102, 7). At side-bar width it is the dot or an icon with
// the count, its words its label and tooltip (ADR 0106, 2).
const props = defineProps<{ sessionId: string; stamp: string }>();
const emit = defineEmits<{ running: [count: number] }>();
const kvman = useKvman();
const open = ref(false);
const trigger = useTemplateRef<HTMLButtonElement>('trigger');
const { jobs, running, logs, stopping, now, load, toggleLogs, stop } = useJobs(kvman, () => props.sessionId, open);
const count = computed(() => (running.value.length > 0 ? running.value.length : jobs.value.length));
const label = computed(() => (running.value.length > 0 ? kvman.t('kvcoder.ui.jobs.running', { count: count.value }) : kvman.t('kvcoder.ui.jobs.ended', { count: count.value })));

function close(): void {
  open.value = false;
  trigger.value?.focus();
}

function outside(event: Event): void {
  if (event.target instanceof Node && !trigger.value?.parentElement?.contains(event.target)) open.value = false;
}

// The conversation says whether Stop leaves background jobs running (ADR 0049, 4).
watch(() => running.value.length, (count) => emit('running', count), { immediate: true });
onMounted(load);
watch(() => [props.sessionId, props.stamp], load);
watch(open, (isOpen) => (isOpen ? document.addEventListener('pointerdown', outside) : document.removeEventListener('pointerdown', outside)));
onBeforeUnmount(() => document.removeEventListener('pointerdown', outside));
</script>

<template>
  <div v-if="jobs.length > 0 || open" class="kvc-jobs" data-test="jobs">
    <button ref="trigger" type="button" class="kvc-button" aria-haspopup="dialog" :aria-expanded="open" :aria-label="label" :title="label" data-test="jobs-chip" @click="open ? close() : (open = true)">
      <span v-if="running.length > 0" class="kvc-dot" aria-hidden="true" />
      <Layers v-else :size="16" class="kvc-jobs-icon" aria-hidden="true" />
      <span class="kvc-jobs-words" data-test="jobs-words">{{ label }}</span>
      <span class="kvc-jobs-count" aria-hidden="true" data-test="jobs-count">{{ count }}</span>
      <ChevronDown :size="16" class="kvc-jobs-chevron" aria-hidden="true" />
    </button>
    <div v-if="open" class="kvc-popover kvc-jobs-panel" role="dialog" :aria-label="kvman.t('kvcoder.ui.jobs.title')" data-test="jobs-popover" @keydown.esc.stop="close">
      <JobItem v-for="job in jobs" :key="job.id" :session-id="props.sessionId" :job="job" :now="now" :logs="logs[job.id]" :stopping="stopping.has(job.id)" @stop="stop(job.id)" @logs="toggleLogs(job.id)" @restarted="load()" />
    </div>
  </div>
</template>

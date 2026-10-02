<script setup lang="ts">
import { useKvman } from './kvman.ts';
import { elapsed, type Job } from './use-jobs.ts';

// One background job in the Running popover (ADR 0009, 153): its title, how long it has run or how it ended, its
// localhost links, Logs, and Stop while it runs.
const props = defineProps<{ job: Job; now: number; logs?: string | undefined; stopping: boolean }>();
const emit = defineEmits<{ stop: []; logs: [] }>();
const kvman = useKvman();
</script>

<template>
  <div class="kvc-job" :data-test="`job-${props.job.id}`" :data-status="props.job.status">
    <div class="kvc-job-head">
      <span class="kvc-job-title kvc-oneline" data-test="job-title">{{ props.job.title }}</span>
      <span v-if="props.job.status === 'running'" class="kvc-muted" data-test="job-time">{{ elapsed(kvman.t, props.now - Date.parse(props.job.startedAt)) }}</span>
      <span v-else class="kvc-chip" data-test="job-status">{{ kvman.t(`kvcoder.ui.jobs.status.${props.job.status}`) }}<template v-if="props.job.exitCode !== undefined && props.job.exitCode !== 0"> · {{ kvman.t('kvcoder.ui.exitCode', { code: props.job.exitCode }) }}</template></span>
    </div>
    <div v-if="props.job.links.length > 0" class="kvc-job-links">
      <a v-for="href in props.job.links" :key="href" :href="href" target="_blank" rel="noopener noreferrer" class="kvc-link kvc-mono" data-test="job-link">{{ href }}</a>
    </div>
    <div class="kvc-actions">
      <button type="button" class="kvc-button" :aria-expanded="props.logs !== undefined" :data-test="`job-logs-${props.job.id}`" @click="emit('logs')">{{ kvman.t('kvcoder.ui.jobs.logs') }}</button>
      <button v-if="props.job.status === 'running'" type="button" class="kvc-button kvc-primary" :disabled="props.stopping" :data-test="`job-stop-${props.job.id}`" @click="emit('stop')">{{ kvman.t('kvcoder.ui.jobs.stop') }}</button>
    </div>
    <pre v-if="props.logs !== undefined" class="kvc-output" data-test="job-output">{{ props.logs === '' ? kvman.t('kvcoder.ui.jobs.noOutput') : props.logs }}</pre>
  </div>
</template>

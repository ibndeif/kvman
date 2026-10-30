<script setup lang="ts">
import { Circle, CircleCheck, CircleX } from '@lucide/vue';
import { computed } from 'vue';
import type { Message } from '../../src/index.ts';
import { durationText } from './durations.ts';
import { useKvman } from './kvman.ts';
import { backgroundName, backgroundRef, stoppedRunsCount, textOf } from './message-parts.ts';
import type { FinishedRun } from './use-finished-runs.ts';

// A finished background job's or helper's result as one quiet line (plan 08 §8.7, ADR 0112, 5): a status mark, the
// run's name, and how long it ran (ADR 0036, 14); pressed, the text the model read. The runs that ended while kvman was
// stopped are one such line (ADR 0085, 5).
const props = defineProps<{ message: Message; finishedRuns?: ReadonlyMap<string, FinishedRun> | undefined }>();
const kvman = useKvman();
const text = computed(() => textOf(props.message.content['content']));
const run = computed(() => props.finishedRuns?.get(backgroundRef(props.message) ?? ''));
const stopped = computed(() => stoppedRunsCount(text.value));
const ended = new Set(['succeeded', 'failed', 'cancelled', 'interrupted']);
const status = computed(() => (stopped.value === undefined && run.value !== undefined && ended.has(run.value.status) ? run.value.status : undefined));
const mark = computed(() => (status.value === 'succeeded' ? CircleCheck : status.value === 'failed' ? CircleX : Circle));
const label = computed(() => kvman.t(status.value === undefined ? 'kvcoder.ui.background.ended' : `kvcoder.ui.jobs.status.${status.value}`));
// A helper is named by the title its run was given, while its run is among the chat's newest (ADR 0037, 2).
const title = computed(() => {
  if (stopped.value !== undefined) return kvman.t('kvcoder.ui.background.endedWhileStopped', { count: stopped.value });
  const helper = props.message.source?.kind === 'subagent';
  return (helper ? run.value?.title : undefined) ?? backgroundName(props.message) ?? kvman.t(helper ? 'kvcoder.ui.helperFinished' : 'kvcoder.ui.backgroundFinished');
});
const ran = computed(() => (stopped.value === undefined && run.value !== undefined ? durationText(kvman.t, run.value.ranMs) : undefined));
</script>

<template>
  <details class="kvc-background-line" data-test="background-result">
    <summary class="kvc-muted">
      <component :is="mark" :size="14" role="img" :aria-label="label" :class="{ 'kvc-background-ok': status === 'succeeded', 'kvc-background-failed': status === 'failed' }" :data-status="status ?? 'ended'" data-test="background-mark" />
      <span dir="auto" class="kvc-oneline" data-test="background-title">{{ title }}</span>
      <template v-if="ran !== undefined"><span aria-hidden="true">·</span><span data-test="background-time">{{ ran }}</span></template>
    </summary>
    <pre class="kvc-output">{{ text }}</pre>
  </details>
</template>

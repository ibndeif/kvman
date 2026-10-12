<script setup lang="ts">
import { computed } from 'vue';
import { runStatusText, type RunResult } from './call-results.ts';
import { durationText } from './durations.ts';
import { fieldValue } from './field-rows.ts';
import FieldsView from './FieldsView.vue';
import FoldedOutput from './FoldedOutput.vue';
import { useKvman } from './kvman.ts';
import LinkedText from './LinkedText.vue';

// What `background output` read of a run (ADR 0062, 2): the run's own description, its status and exit code, how long
// it ran once it has ended, then its problem and its output. It is what the call read, so it never counts time itself.
const props = defineProps<{ run: RunResult }>();
const kvman = useKvman();
const text = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);
const output = computed(() => text(props.run.output));
const problem = computed(() => text(props.run.problem));
const answer = computed(() => ({ type: 'markdown' as const, text: 'kvcoder.markdown', params: { text: output.value ?? '' } }));
</script>

<template>
  <div class="kvc-block kvc-run-row" data-test="run-row">
    <span class="kvc-run-call" dir="auto" data-test="run-call">{{ props.run.call }}</span>
    <span class="kvc-chip" data-test="run-status">{{ runStatusText(kvman.t, props.run.status) }}<template v-if="props.run.exitCode !== undefined"> · {{ kvman.t('kvcoder.ui.exitCode', { code: props.run.exitCode }) }}</template></span>
    <span v-if="props.run.ranMs !== undefined" class="kvc-muted" data-test="run-time">{{ durationText(kvman.t, props.run.ranMs) }}</span>
  </div>
  <pre v-if="problem !== undefined" class="kvc-block kvc-error" dir="auto" :aria-label="kvman.t('kvcoder.ui.call.error')" data-test="run-problem"><LinkedText :text="problem" /></pre>
  <div v-else-if="props.run.problem !== undefined" class="kvc-block kvc-error" :aria-label="kvman.t('kvcoder.ui.call.error')" data-test="run-problem"><FieldsView :value="fieldValue(props.run.problem)" /></div>
  <div v-if="output === undefined && props.run.output !== undefined" class="kvc-block" :aria-label="kvman.t('kvcoder.ui.output')" data-test="call-result-fields"><FieldsView :value="fieldValue(props.run.output)" /></div>
  <div v-else-if="props.run.answer && output" class="kvc-block" :aria-label="kvman.t('kvcoder.ui.call.answer')" data-test="call-answer"><component :is="kvman.View" :view="answer" /></div>
  <FoldedOutput v-else-if="output" :output="output" />
</template>

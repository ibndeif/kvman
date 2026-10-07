<script setup lang="ts">
import { ChevronDown, ChevronRight } from '@lucide/vue';
import { computed, ref } from 'vue';
import CallRequest from './CallRequest.vue';
import CallResult from './CallResult.vue';
import { parsedOutput } from './call-summary.ts';
import CallSummaryLine from './CallSummaryLine.vue';
import { callKind, shortLine, type CallView } from './call-view.ts';
import { durationText } from './durations.ts';
import { useKvman } from './kvman.ts';
import LinkedText from './LinkedText.vue';

// The call card (plan 08 §8.7, ADR 0011, 13; ADR 0036): closed, the call's description, then what it did, to what, and
// the outcome, and its time, all from the same edge; a failed call has a danger border and says "Failed". The time is
// the whole wait: the model writing the call, then the call running (ADR 0017, 1). Opened, it shows the two parts, then
// the call by its kind; a failed call that isn't a line shows its error first. A change and a failure start open.
const props = defineProps<{ view: CallView; failed?: boolean | undefined; durationMs?: number | undefined; output?: string | undefined; running?: boolean | undefined }>();
const kvman = useKvman();
const kind = computed(() => callKind(props.view));
const open = ref(props.output !== undefined && (props.failed === true || kind.value === 'edit' || kind.value === 'write'));
const result = computed(() => (props.failed === true ? undefined : parsedOutput(props.output)));
const errorFirst = computed(() => props.failed === true && kind.value !== 'line');
const time = computed(() => (props.durationMs === undefined ? '' : durationText(kvman.t, (props.view.writtenMs ?? 0) + props.durationMs)));
const timeParts = computed(() => {
  if (props.durationMs === undefined) return '';
  const ran = durationText(kvman.t, props.durationMs);
  return props.view.writtenMs === undefined ? kvman.t('kvcoder.ui.callRan', { ran }) : kvman.t('kvcoder.ui.callParts', { written: durationText(kvman.t, props.view.writtenMs), ran });
});
</script>

<template>
  <div class="kvc-card" :class="{ 'kvc-failed': props.failed }" data-test="call-card">
    <button type="button" class="kvc-card-row kvc-ghost kvc-button" style="inline-size: 100%; border-radius: 0" :aria-expanded="open" :disabled="props.output === undefined" @click="open = !open">
      <span v-if="props.running" class="kvc-spin" :aria-label="kvman.t('kvcoder.ui.running')" />
      <component :is="open ? ChevronDown : ChevronRight" v-else :size="16" aria-hidden="true" />
      <span class="kvc-lines">
        <span v-if="props.view.description" style="font-weight: 600" data-test="call-description">{{ props.view.description }}</span>
        <span v-else-if="props.view.connector === undefined && props.view.line" class="kvc-oneline" data-test="call-line"><span class="kvc-mono">{{ shortLine(props.view.line) }}</span></span>
        <CallSummaryLine :view="props.view" :result="result" />
      </span>
      <span v-if="props.view.risky" class="kvc-chip kvc-warn" data-test="call-risky">{{ kvman.t('kvcoder.ui.call.risky') }}</span>
      <span v-if="props.view.background" class="kvc-chip" data-test="call-background">{{ kvman.t('kvcoder.ui.jobs.background') }}</span>
      <span v-if="props.failed" class="kvc-chip kvc-danger" data-test="call-failed">{{ kvman.t('kvcoder.ui.callFailed') }}</span>
      <span class="kvc-muted" data-test="call-time">{{ time }}</span>
    </button>
    <template v-if="open && props.output !== undefined">
      <p v-if="timeParts !== ''" class="kvc-muted kvc-call-parts" data-test="call-parts">{{ timeParts }}</p>
      <pre v-if="errorFirst" class="kvc-block kvc-error" dir="auto" :aria-label="kvman.t('kvcoder.ui.call.error')" data-test="call-error"><LinkedText :text="props.output" /></pre>
      <CallRequest :view="props.view" />
      <CallResult v-if="!errorFirst" :view="props.view" :output="props.output" :result="result" />
    </template>
  </div>
</template>

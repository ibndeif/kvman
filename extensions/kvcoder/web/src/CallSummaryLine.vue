<script setup lang="ts">
import { computed } from 'vue';
import { callSummary } from './call-summary.ts';
import { shortLine, type CallView } from './call-view.ts';
import { useKvman } from './kvman.ts';

// A call's closed line (ADR 0036, 2): what was done, to what, and the outcome; `connector · command` for a call with
// no line of its own. `whole` keeps a long subject uncut, as an approval needs.
const props = defineProps<{ view: CallView; result?: unknown; whole?: boolean | undefined }>();
const kvman = useKvman();
const summary = computed(() => callSummary(kvman.t, props.view, props.result));
// An outcome of numbers and signs alone, an edit's `+4 −3`, reads left to right in every page language.
const outcomeDirection = computed(() => (/\p{L}/u.test(summary.value?.outcome ?? '') ? undefined : 'ltr'));
const subject = computed(() => (summary.value?.subject === undefined || props.whole === true ? summary.value?.subject : shortLine(summary.value.subject)));
</script>

<template>
  <span v-if="summary !== undefined" class="kvc-summary" data-test="call-summary">
    <span v-if="summary.words" data-test="call-words">{{ summary.words }}</span>
    <span v-if="subject" class="kvc-mono" data-test="call-subject">{{ subject }}</span>
    <span v-if="summary.outcome" class="kvc-muted" :dir="outcomeDirection" data-test="call-outcome">{{ summary.outcome }}</span>
  </span>
  <span v-else-if="props.view.label" class="kvc-muted" dir="ltr" style="align-self: flex-start" data-test="call-label">{{ props.view.label }}</span>
</template>

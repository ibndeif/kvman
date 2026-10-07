<script setup lang="ts">
import { ChevronDown, ChevronRight } from '@lucide/vue';
import { computed, ref } from 'vue';
import { shortLine } from './call-view.ts';
import { durationText } from './durations.ts';
import { useKvman } from './kvman.ts';
import { outputParts, shownOutput } from './output-links.ts';

// The call card (plan 08 §8.7, ADR 0011, 13; ADR 0009, 195, 206, 207): closed, the call's description, then
// `connector · command` and its time, all from the same edge; a failed call has a danger border and says "Failed".
// The time is the whole wait: the model writing the call, then the call running (ADR 0017, 1). Opened, it shows the two
// parts, the payload (the line for a shell or binary call), and the output. A call with no description shows its line.
const props = defineProps<{ description?: string | undefined; label?: string | undefined; line?: string | undefined; payload?: string | undefined; failed?: boolean | undefined; durationMs?: number | undefined; writtenMs?: number | undefined; output?: string | undefined; running?: boolean | undefined; background?: boolean | undefined }>();
const kvman = useKvman();
const open = ref(false);
const parts = computed(() => outputParts(shownOutput(props.output ?? '')));
const time = computed(() => (props.durationMs === undefined ? '' : durationText(kvman.t, (props.writtenMs ?? 0) + props.durationMs)));
const timeParts = computed(() => {
  if (props.durationMs === undefined) return '';
  const ran = durationText(kvman.t, props.durationMs);
  return props.writtenMs === undefined ? kvman.t('kvcoder.ui.callRan', { ran }) : kvman.t('kvcoder.ui.callParts', { written: durationText(kvman.t, props.writtenMs), ran });
});
const detail = computed(() => props.line ?? props.payload);
</script>

<template>
  <div class="kvc-card" :class="{ 'kvc-failed': props.failed }" data-test="call-card">
    <button type="button" class="kvc-card-row kvc-ghost kvc-button" style="inline-size: 100%; border-radius: 0" :aria-expanded="open" :disabled="props.output === undefined" @click="open = !open">
      <span v-if="props.running" class="kvc-spin" :aria-label="kvman.t('kvcoder.ui.running')" />
      <component :is="open ? ChevronDown : ChevronRight" v-else :size="16" aria-hidden="true" />
      <span class="kvc-lines">
        <span v-if="props.description" style="font-weight: 600" data-test="call-description">{{ props.description }}</span>
        <span v-else-if="props.line" class="kvc-oneline" data-test="call-line"><span class="kvc-mono">{{ shortLine(props.line) }}</span></span>
        <span v-if="props.label" class="kvc-muted" dir="ltr" style="align-self: flex-start" data-test="call-label">{{ props.label }}</span>
      </span>
      <span v-if="props.background" class="kvc-chip" data-test="call-background">{{ kvman.t('kvcoder.ui.jobs.background') }}</span>
      <span v-if="props.failed" class="kvc-chip kvc-danger" data-test="call-failed">{{ kvman.t('kvcoder.ui.callFailed') }}</span>
      <span class="kvc-muted" data-test="call-time">{{ time }}</span>
    </button>
    <template v-if="open && props.output !== undefined">
      <p v-if="timeParts !== ''" class="kvc-muted kvc-call-parts" data-test="call-parts">{{ timeParts }}</p>
      <pre v-if="detail !== undefined" class="kvc-output kvc-mono" dir="ltr" :aria-label="kvman.t('kvcoder.ui.command')" data-test="call-payload">{{ detail }}</pre>
      <pre v-if="props.output !== ''" class="kvc-output" dir="auto" :aria-label="kvman.t('kvcoder.ui.output')" data-test="call-output"><template v-for="(part, index) in parts" :key="index"><a v-if="part.kind === 'link'" :href="part.href" target="_blank" rel="noopener noreferrer" class="kvc-link">{{ part.href }}</a><template v-else>{{ part.text }}</template></template></pre>
    </template>
  </div>
</template>

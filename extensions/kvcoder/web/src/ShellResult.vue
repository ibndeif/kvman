<script setup lang="ts">
import { ChevronDown, ChevronRight } from '@lucide/vue';
import { computed, ref } from 'vue';
import { useKvman } from './kvman.ts';
import { outputParts } from './output-links.ts';

// The shell-result card (plan 08 §8.7, ADR 0009, 143): the call's title and description (the command when it has none),
// its exit code and time, and its output, folded until opened.
const props = defineProps<{ command: string; title?: string | undefined; description?: string | undefined; exitCode?: number | undefined; durationMs?: number | undefined; output?: string | undefined; running?: boolean | undefined }>();
const kvman = useKvman();
const open = ref(false);
const parts = computed(() => outputParts(props.output ?? ''));
const seconds = computed(() => (props.durationMs === undefined ? '' : kvman.t('kvcoder.ui.duration', { seconds: (props.durationMs / 1000).toFixed(1) })));
</script>

<template>
  <div class="kvc-card" data-test="shell-result">
    <button type="button" class="kvc-card-row kvc-ghost kvc-button" style="inline-size: 100%; border-radius: 0" :aria-expanded="open" :disabled="props.output === undefined" @click="open = !open">
      <span v-if="props.running" class="kvc-spin" :aria-label="kvman.t('kvcoder.ui.running')" />
      <component :is="open ? ChevronDown : ChevronRight" v-else :size="16" aria-hidden="true" />
      <span v-if="props.title" style="display: flex; flex-direction: column; flex: 1 1 auto; text-align: start; gap: 2px; min-inline-size: 0">
        <span style="font-weight: 600" data-test="call-title">{{ props.title }}</span>
        <span v-if="props.description" class="kvc-muted" data-test="call-description">{{ props.description }}</span>
        <span class="kvc-mono kvc-muted kvc-oneline" data-test="call-command">{{ props.command }}</span>
      </span>
      <span v-else class="kvc-mono" style="flex: 1 1 auto; text-align: start" data-test="call-command">{{ props.command }}</span>
      <span class="kvc-muted">{{ seconds }}</span>
      <span v-if="props.exitCode !== undefined" class="kvc-chip" :class="props.exitCode === 0 ? 'kvc-ok' : 'kvc-warn'" data-test="exit-code">{{ kvman.t('kvcoder.ui.exitCode', { code: props.exitCode }) }}</span>
    </button>
    <pre v-if="open && props.output !== undefined" class="kvc-output" data-test="shell-output"><template v-for="(part, index) in parts" :key="index"><a v-if="part.kind === 'link'" :href="part.href" target="_blank" rel="noopener noreferrer" class="kvc-link">{{ part.href }}</a><template v-else>{{ part.text }}</template></template></pre>
  </div>
</template>

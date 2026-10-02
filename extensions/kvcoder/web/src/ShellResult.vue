<script setup lang="ts">
import { ChevronDown, ChevronRight } from '@lucide/vue';
import { computed, ref } from 'vue';
import { shortCommand } from './call-title.ts';
import { useKvman } from './kvman.ts';
import { outputParts } from './output-links.ts';

// The shell-result card (plan 08 §8.7, ADR 0009, 143, 195, 206, 207): the call's title (derived from its description when
// it has none), its description when that says more, and the command on one short line, all from the same edge, and its
// time; a failed call has a danger border. Opened, it shows the whole command and the output, folded until then.
const props = defineProps<{ command: string; title?: string | undefined; description?: string | undefined; exitCode?: number | undefined; durationMs?: number | undefined; output?: string | undefined; running?: boolean | undefined; background?: boolean | undefined }>();
const kvman = useKvman();
const open = ref(false);
const parts = computed(() => outputParts(props.output ?? ''));
const seconds = computed(() => (props.durationMs === undefined ? '' : kvman.t('kvcoder.ui.duration', { seconds: (props.durationMs / 1000).toFixed(1) })));
const failed = computed(() => props.exitCode !== undefined && props.exitCode !== 0);
const more = computed(() => (props.description !== undefined && props.description !== props.title ? props.description : undefined));
</script>

<template>
  <div class="kvc-card" :class="{ 'kvc-failed': failed }" data-test="shell-result">
    <button type="button" class="kvc-card-row kvc-ghost kvc-button" style="inline-size: 100%; border-radius: 0" :aria-expanded="open" :disabled="props.output === undefined" @click="open = !open">
      <span v-if="props.running" class="kvc-spin" :aria-label="kvman.t('kvcoder.ui.running')" />
      <component :is="open ? ChevronDown : ChevronRight" v-else :size="16" aria-hidden="true" />
      <span class="kvc-lines">
        <span v-if="props.title" style="font-weight: 600" data-test="call-title">{{ props.title }}</span>
        <span v-if="props.title && more" class="kvc-muted" data-test="call-description">{{ more }}</span>
        <span class="kvc-oneline" data-test="call-command"><span class="kvc-mono" :class="{ 'kvc-muted': props.title }">{{ shortCommand(props.command) }}</span></span>
      </span>
      <span v-if="props.background" class="kvc-chip" data-test="call-background">{{ kvman.t('kvcoder.ui.jobs.background') }}</span>
      <span class="kvc-muted">{{ seconds }}</span>
    </button>
    <template v-if="open && props.output !== undefined">
      <pre class="kvc-output kvc-mono" dir="ltr" :aria-label="kvman.t('kvcoder.ui.command')" data-test="shell-command">{{ props.command }}</pre>
      <pre v-if="props.output !== ''" class="kvc-output" dir="auto" :aria-label="kvman.t('kvcoder.ui.output')" data-test="shell-output"><template v-for="(part, index) in parts" :key="index"><a v-if="part.kind === 'link'" :href="part.href" target="_blank" rel="noopener noreferrer" class="kvc-link">{{ part.href }}</a><template v-else>{{ part.text }}</template></template></pre>
    </template>
  </div>
</template>

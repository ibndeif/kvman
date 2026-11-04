<script setup lang="ts">
import { ExternalLink, PanelRight } from '@lucide/vue';
import { useKvman } from './kvman.ts';

// A compact card for an artifact write or edit (plan 08 §8.7, ADR 0009, 177): its title, version, and an Open button.
// A `url` artifact's address, when known and local, opens in a new tab as the panel's link does (ADR 0119, 5).
const props = defineProps<{ id: string; title: string; format: 'markdown' | 'html' | 'url'; version: number; address?: string | undefined }>();
const emit = defineEmits<{ open: [id: string] }>();
const kvman = useKvman();
</script>

<template>
  <div class="kvc-card kvc-card-row" data-test="artifact-card">
    <PanelRight :size="16" aria-hidden="true" />
    <span style="flex: 1 1 auto; min-inline-size: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap" data-test="artifact-card-title">{{ props.title }}</span>
    <span class="kvc-chip" data-test="artifact-card-format">{{ kvman.t(`kvcoder.ui.artifacts.format.${props.format}`) }}</span>
    <span class="kvc-muted" data-test="artifact-card-version">{{ kvman.t('kvcoder.ui.artifacts.version', { version: props.version }) }}</span>
    <a v-if="props.address !== undefined" :href="props.address" target="_blank" rel="noopener noreferrer" class="kvc-button" data-test="artifact-open">{{ kvman.t('kvcoder.ui.artifacts.open') }}<ExternalLink :size="14" aria-hidden="true" /></a>
    <button v-else type="button" class="kvc-button" data-test="artifact-open" @click="emit('open', props.id)">{{ kvman.t('kvcoder.ui.artifacts.open') }}</button>
  </div>
</template>

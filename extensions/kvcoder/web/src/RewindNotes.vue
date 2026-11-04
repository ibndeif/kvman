<script setup lang="ts">
import { computed } from 'vue';
import { problemText, useKvman } from './kvman.ts';
import type { Preview } from './use-rewind.ts';

// What a rewind will do, under an edit or an undo (plan 08 §8.7, ADR 0118, 7): the box for kvman's file changes, the
// files it leaves with why, that shell lines' changes stay, the messages after it, and that the agent stops.
const props = defineProps<{ preview: Preview | undefined; previewError: unknown; changing: number; disabled: boolean }>();
const files = defineModel<boolean>('files', { required: true });
const kvman = useKvman();
const left = computed(() => props.preview?.files.filter((file) => file.state === 'changedSince' || file.state === 'tooLarge') ?? []);
</script>

<template>
  <p v-if="props.previewError !== undefined" class="kvc-muted" role="alert" style="margin: 0" data-test="rewind-preview-error">{{ kvman.t('kvcoder.ui.rewind.previewFailed', { error: problemText(kvman.t, props.previewError) }) }}</p>
  <template v-else-if="props.preview !== undefined">
    <label v-if="props.changing > 0" class="kvc-card-row" data-test="rewind-files"><input v-model="files" type="checkbox" :disabled="props.disabled" />{{ kvman.t('kvcoder.ui.rewind.files', { count: props.changing }) }}</label>
    <ul v-if="left.length > 0" class="kvc-muted" style="margin: 0; padding-inline-start: 18px" data-test="rewind-left">
      <li v-for="file in left" :key="file.path" dir="auto">{{ kvman.t(file.state === 'tooLarge' ? 'kvcoder.ui.rewind.tooLarge' : 'kvcoder.ui.rewind.changedSince', { path: file.path }) }}</li>
    </ul>
    <p class="kvc-muted" style="margin: 0" data-test="rewind-shell">{{ kvman.t('kvcoder.ui.rewind.shell') }}</p>
    <p v-if="props.preview.messages > 1" class="kvc-muted" style="margin: 0" data-test="rewind-later">{{ kvman.t('kvcoder.ui.rewind.later') }}</p>
    <p v-if="props.preview.running" class="kvc-muted" style="margin: 0" data-test="rewind-stops">{{ kvman.t('kvcoder.ui.rewind.stops') }}</p>
  </template>
</template>

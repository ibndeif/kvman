<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { Message } from '../../src/index.ts';
import { problemText, useKvman } from './kvman.ts';
import RewindNotes from './RewindNotes.vue';
import type { Undone } from './rewind-parts.ts';
import { useRewind, type Left } from './use-rewind.ts';

// Undoing the latest message, confirmed where it stands (plan 08 §8.7, ADR 0118, 7): the chat rewinds to just before
// it, and the message goes back to the send box.
const props = defineProps<{ message: Message }>();
const emit = defineEmits<{ cancel: []; done: [undone: Undone, left: Left] }>();
const kvman = useKvman();
const files = ref(true);
const rewind = useRewind(kvman, () => props.message.sessionId, () => props.message.seq ?? -1);
onMounted(() => void rewind.load());

async function undo(): Promise<void> {
  if (rewind.preview.value === undefined) return;
  const done = await rewind.undo(files.value && rewind.changing.value > 0);
  if (done !== undefined) emit('done', done, done.left);
}
</script>

<template>
  <span class="kvc-confirm" role="alertdialog" :aria-label="kvman.t('kvcoder.ui.rewind.undoQuestion')" data-test="undo-confirm" @keydown.escape="emit('cancel')">
    <span>{{ kvman.t('kvcoder.ui.rewind.undoQuestion') }}</span>
    <RewindNotes v-model:files="files" :preview="rewind.preview.value" :preview-error="rewind.previewError.value" :changing="rewind.changing.value" :disabled="rewind.working.value" />
    <span v-if="rewind.error.value !== undefined" class="kvc-muted" role="alert" data-test="rewind-error">{{ kvman.t('kvcoder.ui.rewind.failed', { error: problemText(kvman.t, rewind.error.value) }) }}</span>
    <span class="kvc-connector-actions">
      <button type="button" class="kvc-button" data-test="undo-cancel" @click="emit('cancel')">{{ kvman.t('kvcoder.ui.cancel') }}</button>
      <button type="button" class="kvc-button kvc-primary" :disabled="rewind.preview.value === undefined || rewind.working.value" data-test="undo-confirm-button" @click="undo">{{ kvman.t('kvcoder.ui.rewind.undo') }}</button>
    </span>
  </span>
</template>

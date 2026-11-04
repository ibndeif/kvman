<script setup lang="ts">
import { X } from '@lucide/vue';
import { computed, onMounted, ref } from 'vue';
import type { Message } from '../../src/index.ts';
import { problemText, useKvman } from './kvman.ts';
import { attachedOf, textOf, typedText } from './message-parts.ts';
import RewindNotes from './RewindNotes.vue';
import { savedName } from './rewind-parts.ts';
import { useRewind, type Left } from './use-rewind.ts';

// A message the person typed, edited where it stands (plan 08 §8.7, ADR 0118, 7): its text and its own files, which may
// be removed but not added to, and "Save & send", which rewinds the chat to just before it and sends the new text.
const props = defineProps<{ message: Message }>();
const emit = defineEmits<{ cancel: []; done: [left: Left] }>();
const kvman = useKvman();
const stored = textOf(props.message.content['content']);
const text = ref(typedText(stored));
const images = ref([...(props.message.fileIds ?? [])]);
const imageUrl = (fileId: string): string => `/api/files/${encodeURIComponent(fileId)}?workspaceId=${encodeURIComponent(kvman.workspace.value.id)}`;
const saved = ref(attachedOf(stored));
const files = ref(true);
const rewind = useRewind(kvman, () => props.message.sessionId, () => props.message.seq ?? -1);
const ready = computed(() => text.value.trim() !== '' && rewind.preview.value !== undefined && !rewind.working.value);
onMounted(() => void rewind.load());

async function save(): Promise<void> {
  if (!ready.value) return;
  const left = await rewind.edit({ text: text.value.trim(), fileIds: [...images.value], attachments: [...saved.value], files: files.value && rewind.changing.value > 0 });
  if (left !== undefined) emit('done', left);
}
</script>

<template>
  <div class="kvc-user kvc-edit" dir="auto" role="group" :aria-label="kvman.t('kvcoder.ui.rewind.edit')" data-test="message-edit" @keydown.escape="emit('cancel')">
    <textarea v-model="text" rows="3" :disabled="rewind.working.value" :aria-label="kvman.t('kvcoder.ui.rewind.edit')" data-test="edit-text" @keydown.enter.exact.prevent="save" />
    <span v-if="images.length > 0 || saved.length > 0" style="display: flex; gap: 6px; flex-wrap: wrap">
      <span v-for="image in images" :key="image" class="kvc-chip" data-test="edit-image"><img :src="imageUrl(image)" :alt="kvman.t('kvcoder.ui.attachment')" style="block-size: 24px; border-radius: 4px" /><button type="button" class="kvc-ghost kvc-button kvc-chip-remove" :aria-label="kvman.t('kvcoder.ui.removeAttachment')" :disabled="rewind.working.value" @click="images = images.filter((kept) => kept !== image)"><X :size="12" /></button></span>
      <span v-for="name in saved" :key="name" class="kvc-chip" :title="name" data-test="edit-saved">{{ savedName(name) }}<button type="button" class="kvc-ghost kvc-button kvc-chip-remove" :aria-label="kvman.t('kvcoder.ui.removeAttachment')" :disabled="rewind.working.value" @click="saved = saved.filter((kept) => kept !== name)"><X :size="12" /></button></span>
    </span>
    <RewindNotes v-model:files="files" :preview="rewind.preview.value" :preview-error="rewind.previewError.value" :changing="rewind.changing.value" :disabled="rewind.working.value" />
    <p v-if="rewind.error.value !== undefined" class="kvc-muted" role="alert" style="margin: 0" data-test="rewind-error">{{ kvman.t('kvcoder.ui.rewind.failed', { error: problemText(kvman.t, rewind.error.value) }) }}</p>
    <span class="kvc-connector-actions">
      <button type="button" class="kvc-button" data-test="edit-cancel" @click="emit('cancel')">{{ kvman.t('kvcoder.ui.cancel') }}</button>
      <button type="button" class="kvc-button kvc-primary" :disabled="!ready" data-test="edit-save" @click="save">{{ kvman.t('kvcoder.ui.rewind.save') }}</button>
    </span>
  </div>
</template>

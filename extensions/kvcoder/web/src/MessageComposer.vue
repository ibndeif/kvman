<script setup lang="ts">
import { ArrowUp, Paperclip, Square, X } from '@lucide/vue';
import { ref } from 'vue';
import { useKvman } from './kvman.ts';

// The send box (plan 08 §8.7): Enter sends, Shift+Enter starts a new line; images are uploaded to the kernel's files
// (`POST /api/files`) and sent as `fileIds`; while a step runs, Stop cancels the turn.
const props = defineProps<{ running: boolean; placeholder: string }>();
const emit = defineEmits<{ send: [message: { text: string; fileIds: string[] }]; stop: [] }>();
const kvman = useKvman();
const text = ref('');
const files = ref<{ id: string; name: string }[]>([]);
const picker = ref<HTMLInputElement | null>(null);
const uploading = ref(false);

async function upload(event: Event): Promise<void> {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || input.files === null) return;
  uploading.value = true;
  try {
    for (const file of [...input.files]) {
      const query = new URLSearchParams({ name: file.name, workspaceId: kvman.workspace.value.id });
      const response = await fetch(`/api/files?${query.toString()}`, { method: 'POST', headers: { 'content-type': file.type || 'application/octet-stream' }, body: file });
      const answer: unknown = await response.json();
      const id = typeof answer === 'object' && answer !== null && 'file' in answer && typeof answer.file === 'object' && answer.file !== null && 'id' in answer.file ? String(answer.file.id) : undefined;
      if (id === undefined) kvman.toast('kvcoder.ui.uploadFailed', { name: file.name }, 'error');
      else files.value = [...files.value, { id, name: file.name }];
    }
  } finally {
    uploading.value = false;
    input.value = '';
  }
}

function send(): void {
  const body = text.value.trim();
  if (body === '' || uploading.value) return;
  emit('send', { text: body, fileIds: files.value.map((file) => file.id) });
  text.value = '';
  files.value = [];
}

function onKey(event: KeyboardEvent): void {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
  event.preventDefault();
  send();
}
</script>

<template>
  <div class="kvc-composer">
    <div class="kvc-box">
      <div v-if="files.length > 0" style="display: flex; gap: 6px; flex-wrap: wrap">
        <span v-for="file in files" :key="file.id" class="kvc-chip" data-test="attachment">{{ file.name }}<button type="button" class="kvc-ghost kvc-button" style="min-block-size: 20px; padding: 0" :aria-label="kvman.t('kvcoder.ui.removeAttachment')" @click="files = files.filter((kept) => kept.id !== file.id)"><X :size="12" /></button></span>
      </div>
      <textarea v-model="text" :placeholder="props.placeholder" :aria-label="props.placeholder" rows="2" data-test="composer-text" @keydown="onKey" />
      <div style="display: flex; align-items: center; gap: 8px">
        <input ref="picker" type="file" accept="image/png,image/jpeg,image/gif,image/webp" multiple hidden data-test="composer-files" @change="upload" />
        <button type="button" class="kvc-button" :aria-label="kvman.t('kvcoder.ui.attach')" :disabled="uploading" @click="picker?.click()"><Paperclip :size="16" /></button>
        <span class="kvc-muted" style="flex: 1 1 auto">{{ kvman.t('kvcoder.ui.enterSends') }}</span>
        <button v-if="props.running" type="button" class="kvc-button" data-test="stop" @click="emit('stop')"><Square :size="14" />{{ kvman.t('kvcoder.ui.stop') }}</button>
        <button type="button" class="kvc-button kvc-primary" :aria-label="kvman.t('kvcoder.ui.send')" :disabled="text.trim() === '' || uploading" data-test="send" @click="send"><ArrowUp :size="16" /></button>
      </div>
    </div>
  </div>
</template>

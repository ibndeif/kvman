<script setup lang="ts">
import { computed, inject, ref } from 'vue';
import type { Kvman } from '@kvman/sdk/web';

// `kvvideo.player { payload, output }` (plan 16 §16.8): compose's card in the chat. It plays the player's copy from
// the kernel's files, and says to open the file when there is no copy or it can't load.
const props = defineProps<{ payload: Record<string, unknown>; output: Record<string, unknown> }>();

const kvman = inject<Kvman>('kvman');
if (kvman === undefined) throw new Error('kvvideo components run inside kvwebui, which provides kvman.');
const { t, workspace } = kvman;

const failed = ref(false);
const file = computed(() => (typeof props.output['file'] === 'string' ? props.output['file'] : ''));
const fileId = computed(() => (typeof props.output['fileId'] === 'string' ? props.output['fileId'] : undefined));
const source = computed(() => (fileId.value === undefined ? undefined : `/api/files/${encodeURIComponent(fileId.value)}?workspaceId=${encodeURIComponent(workspace.value.id)}`));
const length = computed(() => {
  const seconds = Math.round((typeof props.output['durationMs'] === 'number' ? props.output['durationMs'] : 0) / 1000);
  return `${String(Math.floor(seconds / 60))}:${String(seconds % 60).padStart(2, '0')}`;
});
</script>

<template>
  <figure class="kvvideo-player" data-test="player">
    <figcaption class="kvvideo-player-head">
      <span class="kvvideo-player-file" dir="auto" data-test="file">{{ file }}</span>
      <span class="kvvideo-player-length" dir="ltr" data-test="length">{{ length }}</span>
    </figcaption>
    <video v-if="source !== undefined && !failed" class="kvvideo-player-video" data-test="video" :src="source" controls preload="metadata" @error="failed = true" />
    <p v-else class="kvvideo-player-unavailable" data-test="unavailable">{{ t('kvvideo.player.unavailable', { file }) }}</p>
  </figure>
</template>

<style>
.kvvideo-player {
  margin: 0;
  padding: var(--kv-space-sm);
  border: 1px solid var(--kv-color-border);
  border-radius: var(--kv-radius);
  background: var(--kv-color-surface);
  max-inline-size: 640px;
}
.kvvideo-player-head {
  display: flex;
  gap: var(--kv-space-sm);
  justify-content: space-between;
  padding-block-end: var(--kv-space-sm);
  color: var(--kv-color-muted);
  font-size: 0.85em;
}
.kvvideo-player-file {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--kv-font-mono);
}
.kvvideo-player-video {
  display: block;
  inline-size: 100%;
  max-block-size: 360px;
  border-radius: calc(var(--kv-radius) / 2);
  background: #000;
}
.kvvideo-player-unavailable {
  margin: 0;
  color: var(--kv-color-text);
}
</style>

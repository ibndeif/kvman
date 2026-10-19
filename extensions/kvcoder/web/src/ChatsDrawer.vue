<script setup lang="ts">
import { MessagesSquare } from '@lucide/vue';
import { onBeforeUnmount, ref, watch } from 'vue';
import { useKvman } from './kvman.ts';
import SessionList from './SessionList.vue';

// The chat list on a narrow page (plan 08 §8.7, ADR 0093, 3): below 60 rem the list beside the chat is hidden, and this
// button opens it over the page; a press outside, Escape, or opening a chat closes it.
const props = defineProps<{ sessionId?: string | undefined }>();
const kvman = useKvman();
const open = ref(false);
const closeOnEscape = (event: KeyboardEvent): void => {
  if (event.key === 'Escape') open.value = false;
};
watch(open, (now) => (now ? window.addEventListener('keydown', closeOnEscape) : window.removeEventListener('keydown', closeOnEscape)));
watch(() => props.sessionId, () => (open.value = false));
onBeforeUnmount(() => window.removeEventListener('keydown', closeOnEscape));
</script>

<template>
  <div class="kvc-chats-bar" data-test="chats-bar">
    <button type="button" class="kvc-button kvc-ghost" :aria-expanded="open" data-test="chats-open" @click="open = !open"><MessagesSquare :size="16" aria-hidden="true" />{{ kvman.t('kvcoder.ui.chats') }}</button>
    <div v-if="open" class="kvc-drawer-backdrop" data-test="chats-backdrop" @click.self="open = false">
      <div class="kvc-drawer" role="dialog" :aria-label="kvman.t('kvcoder.ui.chats')" data-test="chats-drawer">
        <SessionList :session-id="props.sessionId" />
      </div>
    </div>
  </div>
</template>

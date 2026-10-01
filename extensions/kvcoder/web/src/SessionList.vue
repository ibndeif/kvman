<script setup lang="ts">
import { Plus } from '@lucide/vue';
import { computed, onUnmounted, shallowRef, watch } from 'vue';
import type { Session } from '../../src/index.ts';
import { titleText, toastProblem, useKvman } from './kvman.ts';

// The session list (ADR 0009, 104): translated titles, each chat's status, Today and Earlier, the open chat
// highlighted, and "New chat", which opens the Chat page. It reads the list again every few seconds.
const props = defineProps<{ sessionId?: string | undefined }>();
const kvman = useKvman();
const sessions = shallowRef<Session[]>([]);

async function load(): Promise<void> {
  try {
    sessions.value = await kvman.exec('kvcoder.session.list', { limit: 200 });
  } catch (error) {
    toastProblem(kvman, error);
  }
}

const startOfToday = (): number => new Date(new Date().toDateString()).getTime();
const groups = computed(() => {
  const today = startOfToday();
  return [
    { key: 'today', items: sessions.value.filter((session) => Date.parse(session.updatedAt) >= today) },
    { key: 'earlier', items: sessions.value.filter((session) => Date.parse(session.updatedAt) < today) },
  ].filter((group) => group.items.length > 0);
});
const when = (session: Session): string => {
  const date = new Date(session.updatedAt);
  return date.getTime() >= startOfToday() ? date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const timer = setInterval(() => void load(), 5_000);
onUnmounted(() => clearInterval(timer));
watch([() => props.sessionId, () => kvman.workspace.value.id], () => void load(), { immediate: true });
</script>

<template>
  <nav class="kvc-sessions" :aria-label="kvman.t('kvcoder.ui.chats')" data-test="sessions">
    <button type="button" class="kvc-button kvc-primary" style="margin-block-end: 6px" data-test="new-chat" @click="kvman.navigate('kvcoder.chat')"><Plus :size="16" />{{ kvman.t('kvcoder.ui.newChat') }}</button>
    <template v-for="group in groups" :key="group.key">
      <span class="kvc-group">{{ kvman.t(`kvcoder.ui.${group.key}`) }}</span>
      <button v-for="session in group.items" :key="session.id" type="button" class="kvc-session" :aria-current="session.id === props.sessionId ? 'page' : undefined" :data-test="`session-${session.id}`" @click="kvman.navigate('kvcoder.session', { sessionId: session.id })">
        <span>{{ titleText(kvman.t, session.title) }}</span>
        <span v-if="session.status === 'running'" class="kvc-spin" :aria-label="kvman.t('kvcoder.ui.status.running')" data-test="running" />
        <span v-else-if="session.status === 'waiting'" class="kvc-chip kvc-warn" data-test="needs-you">{{ kvman.t('kvcoder.ui.needsYou') }}</span>
        <span v-else class="kvc-muted">{{ when(session) }}</span>
      </button>
    </template>
  </nav>
</template>

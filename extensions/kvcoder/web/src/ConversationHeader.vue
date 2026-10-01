<script setup lang="ts">
import { Ellipsis } from '@lucide/vue';
import { computed, onMounted, ref } from 'vue';
import type { Session } from '../../src/index.ts';
import { titleText, toastProblem, totals, useKvman } from './kvman.ts';

// The conversation's header (plan 08 §8.7, ADR 0009, 104): the title, the session's totals, the model and thinking
// picker, the Chat and Prompt tabs, and the chat's menu.
const props = defineProps<{ session: Session; tab: 'chat' | 'prompt'; turns: number }>();
const emit = defineEmits<{ tab: [tab: 'chat' | 'prompt']; changed: [] }>();
const kvman = useKvman();
const models = ref<{ id: string; name: string }[]>([]);
const menu = ref(false);
const renaming = ref<string | null>(null);
const confirming = ref(false);
const thinkingLevels = ['off', 'minimal', 'low', 'medium', 'high'] as const;
const summary = computed(() => `${kvman.t('kvcoder.ui.turns', { count: props.turns })} · ${totals(kvman.t, props.session.usage, props.session.durationMs)}`);

onMounted(async () => {
  try {
    models.value = (await kvman.exec('kvai.model.list', {})).map(({ id, name }) => ({ id, name }));
  } catch (error) {
    toastProblem(kvman, error);
  }
});

async function run(action: () => Promise<void>): Promise<void> {
  menu.value = false;
  try {
    await action();
    emit('changed');
  } catch (error) {
    toastProblem(kvman, error);
  }
}

const sessionId = () => props.session.id;
const configure = (change: { model?: string; thinking?: (typeof thinkingLevels)[number] }) => run(async () => void (await kvman.exec('kvcoder.session.configure', { sessionId: sessionId(), ...change })));
const rename = () => run(async () => {
  const title = renaming.value?.trim() ?? '';
  renaming.value = null;
  if (title !== '') await kvman.exec('kvcoder.session.rename', { sessionId: sessionId(), title });
});
const fork = () => run(async () => kvman.navigate('kvcoder.session', { sessionId: (await kvman.exec('kvcoder.session.fork', { sessionId: sessionId() })).id }));
const exportFile = () => run(async () => {
  const { fileId } = await kvman.exec('kvcoder.session.export', { sessionId: sessionId() });
  window.location.assign(`/api/files/${encodeURIComponent(fileId)}?workspaceId=${encodeURIComponent(kvman.workspace.value.id)}`);
});
const selected = (event: Event): string => (event.target instanceof HTMLSelectElement ? event.target.value : '');
const onModel = (event: Event) => configure({ model: selected(event) });
const onThinking = (event: Event) => configure({ thinking: thinkingLevels.find((level) => level === selected(event)) ?? 'medium' });
const compact = () => run(async () => void (await kvman.exec('kvcoder.session.compact', { sessionId: sessionId() })));
const remove = () => run(async () => {
  confirming.value = false;
  await kvman.exec('kvcoder.session.delete', { sessionId: sessionId() });
  kvman.navigate('kvcoder.chat');
});
</script>

<template>
  <header class="kvc-header">
    <div class="kvc-title">
      <form v-if="renaming !== null" @submit.prevent="rename"><input v-model="renaming" class="kvc-box" :aria-label="kvman.t('kvcoder.ui.rename')" data-test="rename-input" @blur="rename" /></form>
      <strong v-else data-test="session-title">{{ titleText(kvman.t, props.session.title) }}</strong>
      <span class="kvc-muted" data-test="session-totals">{{ summary }}</span>
    </div>
    <select :value="props.session.model ?? ''" class="kvc-button" :aria-label="kvman.t('kvcoder.ui.model')" data-test="model-picker" @change="onModel">
      <option v-for="model in models" :key="model.id" :value="model.id">{{ model.name }}</option>
    </select>
    <select :value="props.session.thinking" class="kvc-button" :aria-label="kvman.t('kvcoder.ui.thinking')" data-test="thinking-picker" @change="onThinking">
      <option v-for="level in thinkingLevels" :key="level" :value="level">{{ kvman.t(`kvcoder.ui.thinkingLevels.${level}`) }}</option>
    </select>
    <div class="kvc-tabs" role="tablist">
      <button type="button" role="tab" class="kvc-tab" :aria-selected="props.tab === 'chat'" data-test="tab-chat" @click="emit('tab', 'chat')">{{ kvman.t('kvcoder.ui.chatTab') }}</button>
      <button type="button" role="tab" class="kvc-tab" :aria-selected="props.tab === 'prompt'" data-test="tab-prompt" @click="emit('tab', 'prompt')">{{ kvman.t('kvcoder.ui.promptTab') }}</button>
    </div>
    <div style="position: relative">
      <button type="button" class="kvc-button kvc-ghost" :aria-label="kvman.t('kvcoder.ui.menu')" :aria-expanded="menu" data-test="chat-menu" @click="menu = !menu"><Ellipsis :size="18" /></button>
      <div v-if="menu" class="kvc-menu" role="menu">
        <button type="button" role="menuitem" class="kvc-button kvc-ghost" data-test="menu-rename" @click="renaming = typeof props.session.title === 'string' ? props.session.title : ''; menu = false">{{ kvman.t('kvcoder.ui.rename') }}</button>
        <button type="button" role="menuitem" class="kvc-button kvc-ghost" data-test="menu-fork" @click="fork">{{ kvman.t('kvcoder.ui.fork') }}</button>
        <button type="button" role="menuitem" class="kvc-button kvc-ghost" data-test="menu-export" @click="exportFile">{{ kvman.t('kvcoder.ui.export') }}</button>
        <button type="button" role="menuitem" class="kvc-button kvc-ghost" data-test="menu-compact" @click="compact">{{ kvman.t('kvcoder.ui.compact') }}</button>
        <button type="button" role="menuitem" class="kvc-button kvc-ghost kvc-danger" data-test="menu-delete" @click="confirming = true; menu = false">{{ kvman.t('kvcoder.ui.delete') }}</button>
      </div>
      <div v-if="confirming" class="kvc-menu" role="alertdialog" :aria-label="kvman.t('kvcoder.ui.deleteConfirm')">
        <span style="padding: 6px">{{ kvman.t('kvcoder.ui.deleteConfirm') }}</span>
        <div class="kvc-actions">
          <button type="button" class="kvc-button" @click="confirming = false">{{ kvman.t('kvcoder.ui.cancel') }}</button>
          <button type="button" class="kvc-button kvc-primary" data-test="confirm-delete" @click="remove">{{ kvman.t('kvcoder.ui.delete') }}</button>
        </div>
      </div>
    </div>
  </header>
</template>

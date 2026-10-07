<script setup lang="ts">
import { Ellipsis, PanelRight } from '@lucide/vue';
import { computed, ref, useTemplateRef } from 'vue';
import type { Session } from '../../src/index.ts';
import { contextLine, titleText, totals, useKvman } from './kvman.ts';
import type { ContextSize } from './use-conversation.ts';
import JobsChip from './JobsChip.vue';
import { useDismiss } from './use-dismiss.ts';
import { useNow } from './use-now.ts';
import type { WaitingAction } from './use-session-actions.ts';

// The conversation's header (plan 08 §8.7, ADR 0009, 104; ADR 0017, 3, 8 to 10): the title, the session's totals, the
// Running chip (ADR 0009, 153), the artifacts button (ADR 0009, 182), and the chat's menu, which also shows the prompt.
// It spans the conversation and the artifact panel (ADR 0018, 8).
// The menu and its delete confirmation close on a press outside them and on Escape. The conversation runs what the
// menu picks, and while one of its actions is `working` the four that wait are disabled (ADR 0019, 2 and 3).
const props = withDefaults(defineProps<{ session: Session; tab: 'chat' | 'prompt'; turns: number; context?: ContextSize | null; runningSince?: string | undefined; artifacts?: number; artifactsOpen?: boolean; working?: boolean }>(), { context: null, runningSince: undefined, artifacts: 0, artifactsOpen: false, working: false });
const emit = defineEmits<{ tab: [tab: 'chat' | 'prompt']; action: [name: WaitingAction | 'delete', argument: string]; toggleArtifacts: [] }>();
const kvman = useKvman();
const menu = ref(false);
const renaming = ref<string | null>(null);
const confirming = ref(false);
const more = useTemplateRef<HTMLElement>('more');
// The session's time counts its ended turns; the running one is added from the page's clock (ADR 0018, 9).
const now = useNow();
const runningMs = computed(() => (props.runningSince === undefined ? 0 : Math.max(0, now.value - Date.parse(props.runningSince))));
const summary = computed(() => `${kvman.t('kvcoder.ui.turns', { count: props.turns })} · ${totals(kvman.t, props.session.usage, props.session.durationMs + runningMs.value)}`);
const filled = computed(() => contextLine(kvman.t, props.context));
const artifactsLabel = computed(() => kvman.t('kvcoder.ui.artifacts.toggle', { count: props.artifacts }));

function closeMenus(): void {
  menu.value = false;
  confirming.value = false;
}
useDismiss(() => menu.value || confirming.value, () => more.value, closeMenus);

// A menu item closes the menu, then acts.
function pick(action: () => unknown): void {
  closeMenus();
  action();
}

function rename(): void {
  const title = renaming.value ?? '';
  renaming.value = null;
  emit('action', 'rename', title);
}
</script>

<template>
  <header class="kvc-header">
    <div class="kvc-title">
      <form v-if="renaming !== null" @submit.prevent="rename"><input v-model="renaming" class="kvc-field" :aria-label="kvman.t('kvcoder.ui.rename')" data-test="rename-input" @blur="rename" /></form>
      <strong v-else data-test="session-title">{{ titleText(kvman.t, props.session.title) }}</strong>
      <span class="kvc-muted" data-test="session-totals">{{ summary }}</span>
      <span v-if="filled !== undefined" class="kvc-muted" data-test="session-context">{{ filled }}</span>
    </div>
    <JobsChip :session-id="props.session.id" :stamp="props.session.updatedAt" />
    <button v-if="props.artifacts > 0" type="button" class="kvc-button" :aria-pressed="props.artifactsOpen" :aria-label="artifactsLabel" :title="artifactsLabel" data-test="artifacts-toggle" @click="emit('toggleArtifacts')"><PanelRight :size="16" aria-hidden="true" />{{ props.artifacts }}</button>
    <div ref="more" style="position: relative">
      <button type="button" class="kvc-button kvc-ghost" :aria-label="kvman.t('kvcoder.ui.menu')" :aria-expanded="menu" data-test="chat-menu" @click="menu = !menu; confirming = false"><Ellipsis :size="18" /></button>
      <div v-if="menu" class="kvc-menu" role="menu" data-test="chat-menu-items">
        <button type="button" role="menuitem" class="kvc-button kvc-ghost" data-test="menu-rename" :disabled="props.working" @click="pick(() => (renaming = props.session.title))">{{ kvman.t('kvcoder.ui.rename') }}</button>
        <button type="button" role="menuitem" class="kvc-button kvc-ghost" data-test="menu-fork" :disabled="props.working" @click="pick(() => emit('action', 'fork', ''))">{{ kvman.t('kvcoder.ui.fork') }}</button>
        <button type="button" role="menuitem" class="kvc-button kvc-ghost" data-test="menu-export" :disabled="props.working" @click="pick(() => emit('action', 'export', ''))">{{ kvman.t('kvcoder.ui.export') }}</button>
        <button type="button" role="menuitem" class="kvc-button kvc-ghost" data-test="menu-compact" :disabled="props.working" @click="pick(() => emit('action', 'compact', ''))">{{ kvman.t('kvcoder.ui.compact') }}</button>
        <button type="button" role="menuitem" class="kvc-button kvc-ghost" data-test="menu-prompt" @click="pick(() => emit('tab', props.tab === 'prompt' ? 'chat' : 'prompt'))">{{ kvman.t(props.tab === 'prompt' ? 'kvcoder.ui.showChat' : 'kvcoder.ui.showPrompt') }}</button>
        <button type="button" role="menuitem" class="kvc-button kvc-ghost kvc-danger" data-test="menu-delete" @click="menu = false; confirming = true">{{ kvman.t('kvcoder.ui.delete') }}</button>
      </div>
      <div v-if="confirming" class="kvc-menu" role="alertdialog" :aria-label="kvman.t('kvcoder.ui.deleteConfirm')" data-test="delete-confirm">
        <span style="padding: 6px">{{ kvman.t('kvcoder.ui.deleteConfirm') }}</span>
        <div class="kvc-actions">
          <button type="button" class="kvc-button" @click="confirming = false">{{ kvman.t('kvcoder.ui.cancel') }}</button>
          <button type="button" class="kvc-button kvc-primary" data-test="confirm-delete" @click="pick(() => emit('action', 'delete', ''))">{{ kvman.t('kvcoder.ui.delete') }}</button>
        </div>
      </div>
    </div>
  </header>
</template>

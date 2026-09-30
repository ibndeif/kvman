<script setup lang="ts">
import { Check, ChevronDown, Folder, House, Plus, X } from '@lucide/vue';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { problemOf } from '../../api/client.ts';
import { homeWorkspaceId, showProblem, useKvwebui } from '../../state/kvwebui.ts';
import { closeWorkspace, switchWorkspace } from '../../state/workspaces.ts';
import DropdownMenu from '../shared/DropdownMenu.vue';
import OpenFolderDialog from './OpenFolderDialog.vue';

// The workspace picker (plan 06 §6.2, ADR 0009, 74): each open workspace with its folder, a close button on each but
// Home, and "Open a folder…".
const state = useKvwebui();
const { t } = useI18n();
const opening = ref(false);

const nameOf = (id: string, name: string): string => (id === homeWorkspaceId ? t('kvwebui.workspace.home') : name);
const current = computed(() => {
  const workspace = state.workspaces.value.find((candidate) => candidate.id === state.workspace.value);
  return workspace === undefined ? state.workspace.value : nameOf(workspace.id, workspace.name);
});

const attempt = async (action: () => Promise<void>): Promise<void> => {
  await action().catch((error: unknown) => showProblem(state, problemOf(error)));
};
</script>

<template>
  <DropdownMenu :label="t('kvwebui.workspace.label', { name: current })" width="w-96">
    <template #trigger>
      <span class="flex h-9 items-center gap-2 rounded-xl border border-line bg-sunken px-3">
        <Folder class="size-4.5" aria-hidden="true" />
        <span class="font-medium" data-test="workspace-current">{{ current }}</span>
        <ChevronDown class="size-4 text-muted" aria-hidden="true" />
      </span>
    </template>
    <template #default="{ close }">
      <div v-for="workspace in state.workspaces.value" :key="workspace.id" class="flex items-center gap-1 rounded-lg" :class="workspace.id === state.workspace.value ? 'bg-neutral-soft' : ''">
        <button
          type="button"
          role="menuitem"
          class="flex min-h-11 grow items-center gap-2.5 px-2.5 text-start"
          :data-test="`workspace-${workspace.id}`"
          @click="attempt(() => switchWorkspace(state, workspace.id)).then(close)"
        >
          <House v-if="workspace.id === 'home'" class="size-4.5 text-muted" aria-hidden="true" />
          <Folder v-else class="size-4.5 text-muted" aria-hidden="true" />
          <span class="flex min-w-0 grow flex-col">
            <span :class="workspace.id === state.workspace.value ? 'font-medium' : ''">{{ nameOf(workspace.id, workspace.name) }}</span>
            <span class="truncate font-mono text-xs text-muted">{{ workspace.path }}</span>
          </span>
          <Check v-if="workspace.id === state.workspace.value" class="size-4.5 text-primary" aria-hidden="true" />
        </button>
        <button
          v-if="workspace.id !== 'home'"
          type="button"
          class="me-1.5 grid size-7 shrink-0 place-items-center rounded-lg bg-neutral-soft text-neutral-ink"
          :aria-label="t('kvwebui.workspace.close', { name: workspace.name })"
          :data-test="`close-${workspace.id}`"
          @click="attempt(() => closeWorkspace(state, workspace.id))"
        >
          <X class="size-3.5" aria-hidden="true" />
        </button>
      </div>
      <div class="mx-1 my-1.5 h-px bg-line-soft" />
      <button type="button" role="menuitem" class="flex min-h-11 items-center gap-2.5 rounded-lg px-2.5 font-medium text-primary" data-test="open-folder" @click="opening = true; close()">
        <Plus class="size-4.5" aria-hidden="true" />{{ t('kvwebui.workspace.openFolder') }}
      </button>
    </template>
  </DropdownMenu>
  <OpenFolderDialog v-if="opening" @close="opening = false" />
</template>

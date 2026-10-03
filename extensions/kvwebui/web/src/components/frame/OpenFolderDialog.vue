<script setup lang="ts">
import { ArrowUp, Folder } from '@lucide/vue';
import type { z } from '@kvman/sdk';
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { kernelQuerySchemas } from '@kvman/sdk';
import { problemOf } from '../../api/client.ts';
import { homeWorkspaceId, showProblem, useKvwebui } from '../../state/kvwebui.ts';
import { listFolder, openFolder } from '../../state/workspaces.ts';
import ModalDialog from '../shared/ModalDialog.vue';

// "Open a folder…" (plan 06 §6.2, ADR 0009, 220): a folder browser. It shows one folder's sub-folders from
// `kernel.folder.list`, and "Open this folder" runs `kernel.workspace.open` for the folder shown; the tab moves to it.
type Listing = z.output<(typeof kernelQuerySchemas)['kernel.folder.list']['output']>;

const emit = defineEmits<{ close: [] }>();
const state = useKvwebui();
const { t } = useI18n();
const listing = ref<Listing | undefined>(undefined);
const typed = ref('');
const hidden = ref(false);
const reason = ref<string | undefined>(undefined);

// The open workspace's folder, or Home's folder (the query's default) from Home.
const start = computed(() => (state.workspace.value === homeWorkspaceId ? undefined : state.workspaces.value.find((workspace) => workspace.id === state.workspace.value)?.path));

const fail = (error: unknown): void => {
  const problem = problemOf(error);
  reason.value = problem.code === 'VALIDATION_FAILED' ? problem.message : undefined;
  showProblem(state, problem);
};

async function load(path: string | undefined): Promise<void> {
  await listFolder(state, path, hidden.value).then((found) => {
    listing.value = found;
    typed.value = found.path;
    reason.value = undefined;
  }, fail);
}

const open = async (): Promise<void> => {
  if (listing.value === undefined) return;
  await openFolder(state, listing.value.path).then(() => emit('close'), fail);
};

onMounted(() => load(start.value));
watch(hidden, () => load(listing.value?.path));
</script>

<template>
  <ModalDialog :label="t('kvwebui.workspace.openTitle')" @close="emit('close')">
    <span class="text-lg font-semibold">{{ t('kvwebui.workspace.openTitle') }}</span>
    <form class="flex gap-2" @submit.prevent="load(typed.trim())">
      <button type="button" class="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-line bg-surface disabled:opacity-50" :aria-label="t('kvwebui.workspace.up')" :disabled="listing?.parent == null" data-test="folder-up" @click="load(listing?.parent ?? undefined)"><ArrowUp :size="18" aria-hidden="true" /></button>
      <input v-model="typed" type="text" dir="ltr" required class="h-10 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 font-mono text-[13px]" :aria-label="t('kvwebui.workspace.folder')" data-test="folder-path" />
    </form>
    <span v-if="reason" class="text-[13px] text-danger" data-test="folder-issue">{{ reason }}</span>
    <ul class="flex max-h-64 min-h-24 flex-col gap-0.5 overflow-y-auto rounded-xl border border-line p-1" data-test="folder-list">
      <li v-for="folder in listing?.folders ?? []" :key="folder.path">
        <button type="button" class="flex min-h-9 w-full items-center gap-2 rounded-lg px-2.5 text-start hover:bg-sunken" :data-test="`folder-entry-${folder.name}`" @click="load(folder.path)"><Folder :size="16" class="shrink-0 text-muted" aria-hidden="true" /><span class="truncate" dir="auto">{{ folder.name }}</span></button>
      </li>
      <li v-if="listing && listing.folders.length === 0" class="px-2.5 py-2 text-[13px] text-muted" data-test="folder-empty">{{ t('kvwebui.workspace.noFolders') }}</li>
    </ul>
    <span v-if="listing?.truncated" class="text-[13px] text-muted" data-test="folder-truncated">{{ t('kvwebui.workspace.truncated') }}</span>
    <label class="flex items-center gap-2 text-[13px]"><input v-model="hidden" type="checkbox" data-test="folder-hidden" />{{ t('kvwebui.workspace.showHidden') }}</label>
    <span class="text-[13px] text-muted">{{ t('kvwebui.workspace.folderHelp') }}</span>
    <div class="flex justify-end gap-2.5">
      <button type="button" class="h-9.5 rounded-xl border border-line bg-surface px-3.5 font-medium" @click="emit('close')">{{ t('kvwebui.cancel') }}</button>
      <button type="button" class="h-9.5 rounded-xl bg-primary px-3.5 font-medium text-on-primary disabled:opacity-50" :disabled="listing === undefined" data-test="folder-open" @click="open">{{ t('kvwebui.workspace.openThis') }}</button>
    </div>
  </ModalDialog>
</template>

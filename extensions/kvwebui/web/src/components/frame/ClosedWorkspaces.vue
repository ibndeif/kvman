<script setup lang="ts">
import type { ClosedWorkspace } from '@kvman/sdk';
import { ChevronDown, ChevronRight, FolderX } from '@lucide/vue';
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { problemOf } from '../../api/client.ts';
import { kernelCommand, kernelQuery } from '../../api/kernel.ts';
import { showProblem, useKvwebui } from '../../state/kvwebui.ts';
import { openFolder } from '../../state/workspaces.ts';

// The closed workspaces in the picker (plan 06 §6.2; ADR 0061, 5): a folded section with their count; each has
// "Reopen", unless its folder is missing, and "Delete", which asks inline before it erases the workspace's data.
const state = useKvwebui();
const { t } = useI18n();
const closed = ref<ClosedWorkspace[]>([]);
const shown = ref(false);
// What a delete is being confirmed for: one workspace's id, or `missing` for every one whose folder is gone.
const confirming = ref<string>();
const missing = computed(() => closed.value.filter((workspace) => workspace.missing));

async function load(): Promise<void> {
  closed.value = await kernelQuery(state.api, 'kernel.workspace.closed.list', {}).catch((error: unknown) => {
    showProblem(state, problemOf(error));
    return [];
  });
}
onMounted(load);
watch(() => state.workspaces.value, load);

async function reopen(workspace: ClosedWorkspace): Promise<void> {
  await openFolder(state, workspace.path).catch((error: unknown) => showProblem(state, problemOf(error)));
  await load();
}

async function remove(ids: readonly string[]): Promise<void> {
  confirming.value = undefined;
  try {
    for (const workspaceId of ids) await kernelCommand(state.api, 'kernel.workspace.delete', { workspaceId });
  } catch (error) {
    showProblem(state, problemOf(error));
  }
  await load();
}
</script>

<template>
  <div v-if="closed.length > 0" data-test="closed-workspaces">
    <div class="mx-1 my-1.5 h-px bg-line-soft" />
    <button type="button" class="flex min-h-11 w-full items-center gap-2 rounded-lg px-2.5 text-start text-muted" :aria-expanded="shown" data-test="closed-toggle" @click="shown = !shown">
      <component :is="shown ? ChevronDown : ChevronRight" class="size-4 rtl:-scale-x-100" aria-hidden="true" />
      {{ t('kvwebui.workspace.closed', { count: closed.length }) }}
    </button>
    <template v-if="shown">
      <div v-for="workspace in closed" :key="workspace.id" class="flex flex-col gap-1.5 rounded-lg px-2.5 py-1.5" :data-test="`closed-${workspace.id}`">
        <div class="flex items-center gap-2.5">
          <FolderX class="size-4.5 shrink-0 text-muted" aria-hidden="true" />
          <span class="flex min-w-0 grow flex-col">
            <span>{{ workspace.name }}</span>
            <span class="truncate font-mono text-xs text-muted">{{ workspace.path }}</span>
            <span v-if="workspace.missing" class="text-xs text-danger" :data-test="`missing-${workspace.id}`">{{ t('kvwebui.workspace.missing') }}</span>
          </span>
          <button v-if="!workspace.missing" type="button" class="min-h-8 shrink-0 rounded-lg bg-neutral-soft px-2.5 text-[13px] text-neutral-ink" :data-test="`reopen-${workspace.id}`" @click="reopen(workspace)">{{ t('kvwebui.workspace.reopen') }}</button>
          <button type="button" class="min-h-8 shrink-0 rounded-lg bg-neutral-soft px-2.5 text-[13px] text-danger" :data-test="`delete-${workspace.id}`" @click="confirming = workspace.id">{{ t('kvwebui.workspace.delete') }}</button>
        </div>
        <div v-if="confirming === workspace.id" class="flex flex-wrap items-center gap-2 text-[13px]" role="alert" :data-test="`confirm-${workspace.id}`">
          <span class="grow">{{ t('kvwebui.workspace.deleteConfirm') }}</span>
          <button type="button" class="min-h-8 rounded-lg bg-danger px-2.5 text-white" :data-test="`confirm-delete-${workspace.id}`" @click="remove([workspace.id])">{{ t('kvwebui.workspace.delete') }}</button>
          <button type="button" class="min-h-8 rounded-lg bg-neutral-soft px-2.5 text-neutral-ink" @click="confirming = undefined">{{ t('kvwebui.cancel') }}</button>
        </div>
      </div>
      <div v-if="missing.length > 0" class="flex flex-wrap items-center gap-2 px-2.5 py-1.5 text-[13px]">
        <template v-if="confirming === 'missing'">
          <span class="grow" role="alert">{{ t('kvwebui.workspace.deleteMissingConfirm', { count: missing.length }) }}</span>
          <button type="button" class="min-h-8 rounded-lg bg-danger px-2.5 text-white" data-test="confirm-delete-missing" @click="remove(missing.map((workspace) => workspace.id))">{{ t('kvwebui.workspace.delete') }}</button>
          <button type="button" class="min-h-8 rounded-lg bg-neutral-soft px-2.5 text-neutral-ink" @click="confirming = undefined">{{ t('kvwebui.cancel') }}</button>
        </template>
        <button v-else type="button" class="ms-auto min-h-8 rounded-lg bg-neutral-soft px-2.5 text-danger" data-test="delete-missing" @click="confirming = 'missing'">{{ t('kvwebui.workspace.deleteAllMissing') }}</button>
      </div>
    </template>
  </div>
</template>

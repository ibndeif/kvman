<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { problemOf } from '../../api/client.ts';
import { showProblem, useKvwebui } from '../../state/kvwebui.ts';
import { openFolder } from '../../state/workspaces.ts';
import ModalDialog from '../shared/ModalDialog.vue';

// "Open a folder…": a typed absolute path for `kernel.workspace.open`; the tab moves to that workspace.
const emit = defineEmits<{ close: [] }>();
const state = useKvwebui();
const { t } = useI18n();
const path = ref('');

const submit = async (): Promise<void> => {
  await openFolder(state, path.value.trim()).then(
    () => emit('close'),
    (error: unknown) => showProblem(state, problemOf(error)),
  );
};
</script>

<template>
  <ModalDialog :label="t('kvwebui.workspace.openTitle')" @close="emit('close')">
    <form class="flex flex-col gap-4" @submit.prevent="submit">
      <span class="text-lg font-semibold">{{ t('kvwebui.workspace.openTitle') }}</span>
      <label class="flex flex-col gap-1.5">
        <span class="font-medium">{{ t('kvwebui.workspace.folder') }}</span>
        <input v-model="path" type="text" required class="h-10 rounded-xl border border-line bg-surface px-3 font-mono text-[13px]" data-test="folder-path" />
        <span class="text-[13px] text-muted">{{ t('kvwebui.workspace.folderHelp') }}</span>
      </label>
      <div class="flex justify-end gap-2.5">
        <button type="button" class="h-9.5 rounded-xl border border-line bg-surface px-3.5 font-medium" @click="emit('close')">{{ t('kvwebui.cancel') }}</button>
        <button type="submit" class="h-9.5 rounded-xl bg-primary px-3.5 font-medium text-on-primary" data-test="folder-open">{{ t('kvwebui.workspace.open') }}</button>
      </div>
    </form>
  </ModalDialog>
</template>

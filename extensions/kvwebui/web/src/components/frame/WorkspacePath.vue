<script setup lang="ts">
import { FolderOpen } from '@lucide/vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { homeWorkspaceId, useKvwebui } from '../../state/kvwebui.ts';
import { shownPath } from '../../state/shown-path.ts';

// The status bar's first item (ADR 0009, 145): the tab's workspace folder, with the person's home folder as `~`.
const state = useKvwebui();
const { t } = useI18n();
const folder = computed(() => state.workspaces.value.find((workspace) => workspace.id === state.workspace.value)?.path);
const home = computed(() => state.workspaces.value.find((workspace) => workspace.id === homeWorkspaceId)?.path);
</script>

<template>
  <span v-if="folder !== undefined" class="flex min-w-0 shrink items-center gap-1.5" :title="folder" data-test="status-workspace">
    <FolderOpen class="size-3.5 shrink-0" aria-hidden="true" />
    <span class="sr-only">{{ t('kvwebui.status.workspace') }}</span>
    <bdi dir="ltr" class="truncate">{{ shownPath(folder, home) }}</bdi>
  </span>
</template>

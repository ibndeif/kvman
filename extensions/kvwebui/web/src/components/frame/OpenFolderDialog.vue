<script setup lang="ts">
import { ArrowLeft, ArrowUp, Folder, FolderPlus, LoaderCircle } from '@lucide/vue';
import { computed, nextTick, onMounted, ref, useTemplateRef, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { homeWorkspaceId, useKvwebui } from '../../state/kvwebui.ts';
import { useFolderBrowser } from '../../state/use-folder-browser.ts';
import ModalDialog from '../shared/ModalDialog.vue';
import FolderBreadcrumbs from './FolderBreadcrumbs.vue';
import FolderPlaces, { type Place } from './FolderPlaces.vue';
import NewFolderRow from './NewFolderRow.vue';

// "Open a folder…" (plan 06 §6.2, ADR 0009, 220 and 222 to 225): a folder browser. It shows one folder's sub-folders
// from `kernel.folder.list`, and "Open this folder" runs `kernel.workspace.open` for the folder shown; the tab moves to it.
const emit = defineEmits<{ close: [] }>();
const state = useKvwebui();
const { t } = useI18n();
const browser = useFolderBrowser(state, () => emit('close'));
const { listing, folders } = browser;
const typed = ref('');
const edited = ref(false);
const making = ref(false);
const filterField = useTemplateRef<HTMLInputElement>('filterField');
const list = useTemplateRef<HTMLElement>('list');

// The open workspace's folder, or Home's folder (the query's default) from Home.
const start = computed(() => (state.workspace.value === homeWorkspaceId ? undefined : state.workspaces.value.find((workspace) => workspace.id === state.workspace.value)?.path));
const places = computed<Place[]>(() => state.workspaces.value.map((workspace) => ({ id: workspace.id, label: workspace.id === homeWorkspaceId ? t('kvwebui.workspace.home') : workspace.name, path: workspace.path })));

onMounted(async () => {
  await browser.load(start.value);
  filterField.value?.focus();
});
// The path field follows the folder shown, unless the person has typed in it since they last went somewhere.
watch(() => listing.value?.path, (path) => {
  if (path !== undefined && !edited.value) typed.value = path;
});
watch(browser.highlighted, async () => {
  await nextTick();
  list.value?.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' });
});

function onKey(event: KeyboardEvent): void {
  const { key } = event;
  if (key === 'ArrowDown' || key === 'ArrowUp') {
    event.preventDefault();
    browser.move(key === 'ArrowDown' ? 1 : -1);
  } else if (key === 'Enter') {
    event.preventDefault();
    const target = folders.value[browser.highlighted.value];
    if (target === undefined) void browser.open();
    else go(target.path);
  } else if (key === 'Backspace' && browser.filter.value === '') {
    event.preventDefault();
    void browser.up();
  } else if (key === 'Escape' && browser.filter.value !== '') {
    event.stopPropagation();
    browser.filter.value = '';
  }
}

function go(path: string | undefined): void {
  edited.value = false;
  void browser.load(path);
}

async function create(name: string): Promise<void> {
  if (await browser.create(name)) making.value = false;
}
</script>

<template>
  <ModalDialog :label="t('kvwebui.workspace.openTitle')" wide @close="emit('close')">
    <span class="text-lg font-semibold">{{ t('kvwebui.workspace.openTitle') }}</span>
    <FolderPlaces :places="places" :current="listing?.path" @go="go($event)" />
    <form class="flex gap-2" @submit.prevent="go(typed.trim())">
      <button type="button" class="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-line bg-surface disabled:opacity-50" :aria-label="t('kvwebui.workspace.back')" :disabled="browser.visited.value.length === 0" data-test="folder-back" @click="edited = false; browser.back()"><ArrowLeft :size="18" class="rtl:-scale-x-100" aria-hidden="true" /></button>
      <button type="button" class="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-line bg-surface disabled:opacity-50" :aria-label="t('kvwebui.workspace.up')" :disabled="listing?.parent == null" data-test="folder-up" @click="edited = false; browser.up()"><ArrowUp :size="18" aria-hidden="true" /></button>
      <input v-model="typed" type="text" dir="ltr" required class="h-10 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 font-mono text-[13px]" :aria-label="t('kvwebui.workspace.folder')" data-test="folder-path" @input="edited = true" />
      <LoaderCircle v-if="browser.loading.value" :size="18" class="my-auto shrink-0 animate-spin text-muted" aria-hidden="true" data-test="folder-spinner" />
    </form>
    <FolderBreadcrumbs v-if="listing" :path="listing.path" @go="go($event)" />
    <span v-if="browser.reason.value" class="text-[13px] text-danger" role="alert" data-test="folder-issue">{{ browser.reason.value }}</span>
    <div class="flex gap-2">
      <input ref="filterField" v-model="browser.filter.value" type="text" role="combobox" aria-expanded="true" aria-controls="folder-options" class="h-9 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 text-[14px]" :aria-label="t('kvwebui.workspace.filter')" :placeholder="t('kvwebui.workspace.filter')" :aria-activedescendant="browser.highlighted.value >= 0 ? `folder-option-${String(browser.highlighted.value)}` : undefined" data-test="folder-filter" @keydown="onKey" />
      <button type="button" class="flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-line bg-surface px-3 text-[14px]" :aria-pressed="making" data-test="folder-new" @click="making = !making"><FolderPlus :size="16" aria-hidden="true" />{{ t('kvwebui.workspace.newFolder') }}</button>
    </div>
    <NewFolderRow v-if="making" :busy="browser.creating.value" :reason="browser.createReason.value" @create="create" @cancel="making = false" />
    <ul id="folder-options" ref="list" role="listbox" :aria-label="t('kvwebui.workspace.folder')" :aria-busy="browser.loading.value" class="flex max-h-80 min-h-32 flex-col gap-0.5 overflow-y-auto rounded-xl border border-line p-1 transition-opacity" :class="{ 'opacity-60': browser.loading.value }" data-test="folder-list">
      <li v-for="(folder, index) in folders" :id="`folder-option-${String(index)}`" :key="folder.path" role="option" :aria-selected="browser.highlighted.value === index">
        <button type="button" tabindex="-1" class="flex min-h-9 w-full items-center gap-2 rounded-lg px-2.5 text-start hover:bg-sunken" :class="{ 'bg-sunken': browser.highlighted.value === index }" :data-test="`folder-entry-${folder.name}`" @click="go(folder.path)">
          <Folder :size="16" class="shrink-0 text-muted" aria-hidden="true" /><span class="truncate" dir="auto">{{ folder.name }}</span>
          <span v-if="browser.openPaths.value.has(folder.path)" class="ms-auto shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent-ink" :data-test="`folder-open-mark-${folder.name}`">{{ t('kvwebui.workspace.alreadyOpen') }}</span>
        </button>
      </li>
      <li v-if="listing && listing.folders.length === 0" class="px-2.5 py-2 text-[13px] text-muted" data-test="folder-empty">{{ t('kvwebui.workspace.noFolders') }}</li>
      <li v-else-if="listing && folders.length === 0" class="px-2.5 py-2 text-[13px] text-muted" data-test="folder-no-match">{{ t('kvwebui.workspace.noMatch') }}</li>
    </ul>
    <span v-if="listing?.truncated" class="text-[13px] text-muted" data-test="folder-truncated">{{ t('kvwebui.workspace.truncated') }}</span>
    <label class="flex items-center gap-2 text-[13px]"><input v-model="browser.hidden.value" type="checkbox" data-test="folder-hidden" />{{ t('kvwebui.workspace.showHidden') }}</label>
    <span class="text-[13px] text-muted">{{ t('kvwebui.workspace.folderHelp') }}</span>
    <div class="flex justify-end gap-2.5">
      <button type="button" class="h-9.5 rounded-xl border border-line bg-surface px-3.5 font-medium" @click="emit('close')">{{ t('kvwebui.cancel') }}</button>
      <button type="button" class="h-9.5 rounded-xl bg-primary px-3.5 font-medium text-on-primary disabled:opacity-50" :disabled="listing === undefined" data-test="folder-open" @click="browser.open()">{{ t('kvwebui.workspace.openThis') }}</button>
    </div>
  </ModalDialog>
</template>

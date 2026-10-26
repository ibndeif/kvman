<script setup lang="ts">
import { computed, watchEffect } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import { extensionTitle, pathExtension } from '../../state/extension-text.ts';
import { builtinPages, routePage } from '../../state/navigation.ts';
import { homeWorkspaceId, settingValue, useKvwebui } from '../../state/kvwebui.ts';
import ConfirmDialog from '../shared/ConfirmDialog.vue';
import ToastStack from '../shared/ToastStack.vue';
import EmbeddedStatusLine from './EmbeddedStatusLine.vue';
import HostPagesMenu from './HostPagesMenu.vue';
import LoadFailures from './LoadFailures.vue';
import NavBar from './NavBar.vue';
import PanelArea from './PanelArea.vue';
import PanelSheet from './PanelSheet.vue';
import StatusBar from './StatusBar.vue';
import TopBar from './TopBar.vue';

// The frame (plan 06 §6.2): the top bar, the nav, the page, the panels, and the status bar. An embedded page has none of
// them: the page fills its host's frame, panels open as a sheet over it, a slim line holds the status items, and the
// host opens the pages menu (ADR 0100, 10 and 13; ADR 0101, 2 and 4). The page's scrolling area is the containing block
// of what it holds, so nothing stretches the document (ADR 0101, 13).
const state = useKvwebui();
const route = useRoute();
const translator = useI18n();
const { t } = translator;

const appTitle = computed(() => {
  const title = settingValue(state, 'kvwebui.title');
  return typeof title === 'string' ? title : 'kvwebui.title.default';
});

// The title of the page the route shows: an extension's own title on its page (ADR 0014, 4).
const pageTitle = computed(() => {
  const registry = state.registry.value;
  const extension = pathExtension(state, route.path);
  if (extension !== undefined) return extensionTitle(translator, extension);
  const home = settingValue(state, 'kvwebui.home');
  const pageId = route.path === '/' && typeof home === 'string' ? home : (routePage(registry, route)?.id ?? Object.keys(builtinPages).find((id) => builtinPages[id]?.path === route.path));
  if (pageId === undefined) return t('kvwebui.notFound.title');
  return t(builtinPages[pageId]?.title ?? registry.pages.get(pageId)?.title ?? builtinPages['kvwebui.extensions']?.title ?? '');
});

const workspaceName = computed(() => {
  if (state.workspace.value === homeWorkspaceId) return t('kvwebui.workspace.home');
  return state.workspaces.value.find((workspace) => workspace.id === state.workspace.value)?.name ?? state.workspace.value;
});

// The status items' counts start the title, so a person who looks at the tab sees what waits (ADR 0091, 7).
const titleCount = computed(() => [...state.titleCounts.values()].reduce((sum, count) => sum + count, 0));

watchEffect(() => {
  const title = [pageTitle.value, workspaceName.value, t(appTitle.value)].join(' · ');
  document.title = titleCount.value > 0 ? `(${String(titleCount.value)}) ${title}` : title;
});
</script>

<template>
  <div v-if="state.host.embedded.value" class="flex h-full flex-col bg-surface font-sans text-sm/relaxed text-ink" data-test="embedded">
    <div class="relative flex min-h-0 grow flex-col">
      <main class="relative flex min-h-0 min-w-0 grow flex-col gap-3 overflow-auto p-2">
        <LoadFailures />
        <RouterView :key="route.fullPath" />
      </main>
      <PanelSheet />
    </div>
    <EmbeddedStatusLine />
    <HostPagesMenu />
    <ToastStack />
    <ConfirmDialog />
  </div>
  <div v-else class="flex h-full flex-col bg-ground font-sans text-sm/relaxed text-ink">
    <TopBar :title="appTitle" />
    <div class="flex min-h-0 grow">
      <NavBar />
      <main class="relative flex min-w-0 grow flex-col gap-4 overflow-auto px-4 py-5 md:px-9 md:py-7">
        <LoadFailures />
        <RouterView :key="route.fullPath" />
      </main>
      <PanelArea />
    </div>
    <StatusBar />
    <ToastStack />
    <ConfirmDialog />
  </div>
</template>

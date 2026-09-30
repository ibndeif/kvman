<script setup lang="ts">
import { computed } from 'vue';
import { settingValue, useKvwebui } from '../../state/kvwebui.ts';
import ViewNode from '../views/ViewNode.vue';
import ExtensionsPage from './ExtensionsPage.vue';
import SettingsPage from './SettingsPage.vue';

// `/` shows the preset's `kvwebui.home` (plan 06 §6.3). When that page isn't available, the Extensions page shows
// instead, with the HOME_UNAVAILABLE card and the Problem of the extension that should provide it.
const state = useKvwebui();
const home = computed(() => {
  const value = settingValue(state, 'kvwebui.home');
  return typeof value === 'string' ? value : '';
});
const page = computed(() => {
  const entry = state.registry.value.pages.get(home.value);
  return entry !== undefined && entry.params.length === 0 ? entry : undefined;
});
const failure = computed(() => state.registry.value.failures.find((candidate) => home.value.startsWith(`${candidate.namespace}.`)));
</script>

<template>
  <SettingsPage v-if="home === 'kvwebui.settings'" />
  <ExtensionsPage v-else-if="home === 'kvwebui.extensions'" />
  <ViewNode v-else-if="page" :view="page.view" :scope="{ params: {} }" />
  <ExtensionsPage v-else :home-unavailable="{ page: home, problem: failure?.problem }" />
</template>

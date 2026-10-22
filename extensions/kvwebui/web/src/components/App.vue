<script setup lang="ts">
import { onMounted, onUnmounted, watch } from 'vue';
import { boot } from '../state/boot.ts';
import { catchNewWindowLinks, postToHost } from '../state/embedded.ts';
import { listenToHost } from '../state/host-messages.ts';
import { useI18nState } from '../state/i18n.ts';
import { useKvwebui } from '../state/kvwebui.ts';
import AppFrame from './frame/AppFrame.vue';
import ErrorCard from './shared/ErrorCard.vue';

const state = useKvwebui();
const i18n = useI18nState();
const { booted, bootProblem } = state;
const releaseLinks = catchNewWindowLinks(document);
const releaseHost = listenToHost(state);
// An embedded page tells its host its workspace once booted and after each switch (ADR 0100, 11).
watch([booted, state.workspace], ([isBooted, workspaceId]) => {
  if (isBooted) postToHost({ kind: 'kvman.state', workspaceId });
});
onMounted(() => {
  void boot(state, i18n);
});
onUnmounted(() => {
  releaseLinks();
  releaseHost();
});
</script>

<template>
  <div v-if="bootProblem" class="grid min-h-full place-items-center bg-ground p-6 font-sans">
    <ErrorCard :problem="bootProblem" title="kvwebui.errors.bootFailed" class="max-w-xl" />
  </div>
  <AppFrame v-else-if="booted" />
</template>

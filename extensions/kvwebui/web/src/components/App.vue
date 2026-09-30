<script setup lang="ts">
import { onMounted } from 'vue';
import { boot } from '../state/boot.ts';
import { useI18nState } from '../state/i18n.ts';
import { useKvwebui } from '../state/kvwebui.ts';
import AppFrame from './frame/AppFrame.vue';
import ErrorCard from './shared/ErrorCard.vue';

const state = useKvwebui();
const i18n = useI18nState();
const { booted, bootProblem } = state;
onMounted(() => {
  void boot(state, i18n);
});
</script>

<template>
  <div v-if="bootProblem" class="grid min-h-full place-items-center bg-ground p-6 font-sans">
    <ErrorCard :problem="bootProblem" title="kvwebui.errors.bootFailed" class="max-w-xl" />
  </div>
  <AppFrame v-else-if="booted" />
</template>

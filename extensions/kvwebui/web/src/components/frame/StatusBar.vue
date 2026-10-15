<script lang="ts">
export const statusMilliseconds = 30_000;
</script>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { paramNames } from '../../contributions/references.ts';
import { stringList } from '../../state/hidden-screens.ts';
import { routePage } from '../../state/navigation.ts';
import { settingValue, useKvwebui } from '../../state/kvwebui.ts';
import HealthItem from './HealthItem.vue';
import StatusItem from './StatusItem.vue';
import WorkspacePath from './WorkspacePath.vue';

// The status bar (plan 06 §6.2): the workspace folder first, then contributed items on the start side, kvman's health on
// the end side. They rerun every 30 s, and after every command the UI runs. An item that reads a route param isn't shown
// on a page without it (ADR 0009, 146).
const state = useKvwebui();
const route = useRoute();
const tick = ref(0);
let timer: ReturnType<typeof setInterval> | undefined;
const params = computed(() => routePage(state.registry.value, route)?.params ?? {});
const hidden = computed(() => stringList(settingValue(state, 'kvwebui.status.hidden')));
const items = computed(() => state.registry.value.status.filter((item) => !hidden.value.includes(item.id) && paramNames(item.input).every((name) => params.value[name] !== undefined)));
onMounted(() => {
  timer = setInterval(() => {
    tick.value += 1;
  }, statusMilliseconds);
});
onUnmounted(() => clearInterval(timer));
</script>

<template>
  <footer class="flex h-7.5 shrink-0 items-center gap-4 overflow-hidden border-t border-line bg-surface px-4 text-xs whitespace-nowrap text-muted" data-test="status-bar">
    <WorkspacePath v-if="!hidden.includes('kvwebui.folder')" />
    <StatusItem v-for="item in items" :key="item.id" :item="item" :params="params" :tick="tick" />
    <div class="grow" />
    <HealthItem :tick="tick" />
  </footer>
</template>

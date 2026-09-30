<script lang="ts">
export const statusMilliseconds = 30_000;
</script>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { useKvwebui } from '../../state/kvwebui.ts';
import HealthItem from './HealthItem.vue';
import StatusItem from './StatusItem.vue';

// The status bar (plan 06 §6.2): contributed items on the start side, kvman's health on the end side. They rerun every
// 30 s, and after every command the UI runs.
const state = useKvwebui();
const tick = ref(0);
let timer: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  timer = setInterval(() => {
    tick.value += 1;
  }, statusMilliseconds);
});
onUnmounted(() => clearInterval(timer));
</script>

<template>
  <footer class="flex h-7.5 shrink-0 items-center gap-4 border-t border-line bg-surface px-4 text-xs text-muted" data-test="status-bar">
    <StatusItem v-for="item in state.registry.value.status" :key="item.id" :item="item" :tick="tick" />
    <div class="grow" />
    <HealthItem :tick="tick" />
  </footer>
</template>

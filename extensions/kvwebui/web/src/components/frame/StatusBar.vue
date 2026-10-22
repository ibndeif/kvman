<script setup lang="ts">
import { useStatusItems } from '../../composables/use-status-items.ts';
import HealthItem from './HealthItem.vue';
import StatusItem from './StatusItem.vue';
import WorkspacePath from './WorkspacePath.vue';

// The status bar (plan 06 §6.2): the workspace folder first, then contributed items on the start side, kvman's health on
// the end side. They rerun every 30 s, and after every command the UI runs.
const { items, params, hidden, tick } = useStatusItems();
</script>

<template>
  <footer class="flex h-7.5 shrink-0 items-center gap-4 overflow-hidden border-t border-line bg-surface px-4 text-xs whitespace-nowrap text-muted" data-test="status-bar">
    <WorkspacePath v-if="!hidden.includes('kvwebui.folder')" />
    <StatusItem v-for="item in items" :key="item.id" :item="item" :params="params" :tick="tick" />
    <div class="grow" />
    <HealthItem :tick="tick" />
  </footer>
</template>

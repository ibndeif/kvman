<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useStatusItems } from '../../composables/use-status-items.ts';
import type { StatusEntry } from '../../contributions/registry.ts';
import { useKvwebui } from '../../state/kvwebui.ts';
import StatusItem from './StatusItem.vue';

// The embedded page's status line (plan 06 §6.2, ADR 0101, 2): the contributed status items, without the workspace
// folder, which the host shows; while kvman doesn't answer, the reconnecting text. One line, cut at its end (ADR 0106,
// 8). Hidden when it has nothing to show, an item at 0 included; it stays mounted then, so its items keep asking.
const state = useKvwebui();
const { t } = useI18n();
const { items, params, tick } = useStatusItems();
const showing = (item: StatusEntry): boolean => item.titleCount === undefined || state.titleCounts.get(item.id) !== 0;
const shown = computed(() => items.value.some(showing) || !state.online.value);
</script>

<template>
  <footer v-if="items.length > 0 || !state.online.value" v-show="shown" class="flex min-h-6 shrink-0 flex-nowrap items-center gap-x-3 overflow-hidden border-t border-line bg-surface px-2 py-0.5 text-xs whitespace-nowrap text-muted" data-test="status-line">
    <span v-if="!state.online.value" class="flex items-center gap-1.5 text-danger" role="status" data-test="reconnecting"><span class="size-2 rounded-full bg-danger" />{{ t('kvwebui.host.reconnecting') }}</span>
    <StatusItem v-for="item in items" :key="item.id" :item="item" :params="params" :tick="tick" />
  </footer>
</template>

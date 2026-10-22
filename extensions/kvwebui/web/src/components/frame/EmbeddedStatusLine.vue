<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useStatusItems } from '../../composables/use-status-items.ts';
import { useKvwebui } from '../../state/kvwebui.ts';
import StatusItem from './StatusItem.vue';

// The embedded page's status line (plan 06 §6.2, ADR 0101, 2): the contributed status items, without the workspace
// folder, which the host shows; while kvman doesn't answer, the reconnecting text. Hidden when it has nothing to show.
const state = useKvwebui();
const { t } = useI18n();
const { items, params, tick } = useStatusItems();
const shown = computed(() => items.value.length > 0 || !state.online.value);
</script>

<template>
  <footer v-if="shown" class="flex min-h-6 shrink-0 flex-wrap items-center gap-x-3 border-t border-line bg-ground px-2 py-0.5 text-xs text-muted" data-test="status-line">
    <span v-if="!state.online.value" class="flex items-center gap-1.5 text-danger" role="status" data-test="reconnecting"><span class="size-2 rounded-full bg-danger" />{{ t('kvwebui.host.reconnecting') }}</span>
    <StatusItem v-for="item in items" :key="item.id" :item="item" :params="params" :tick="tick" />
  </footer>
</template>

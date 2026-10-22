<script setup lang="ts">
import { X } from '@lucide/vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useKvwebui } from '../../state/kvwebui.ts';
import { setPanel } from '../../state/panels.ts';
import ViewNode from '../views/ViewNode.vue';

// The open panel of an embedded page (plan 06 §6.2, ADR 0101, 4): a sheet over the page at the frame's full width.
const state = useKvwebui();
const { t } = useI18n();
const open = computed(() => state.registry.value.panels.find((panel) => panel.id === state.panel.value));
</script>

<template>
  <aside v-if="open" class="absolute inset-0 z-30 flex flex-col bg-surface" :aria-label="t(open.title)" :data-test="`panel-${open.id}`">
    <div class="flex h-10 shrink-0 items-center gap-2 border-b border-line ps-3 pe-1">
      <span class="grow truncate font-semibold">{{ t(open.title) }}</span>
      <button type="button" class="grid size-8 place-items-center rounded-lg" :aria-label="t('kvwebui.panel.close')" data-test="panel-close" @click="setPanel(state, null)"><X class="size-4" aria-hidden="true" /></button>
    </div>
    <div class="flex grow flex-col gap-3 overflow-auto p-2"><ViewNode :view="open.view" :scope="{}" /></div>
  </aside>
</template>

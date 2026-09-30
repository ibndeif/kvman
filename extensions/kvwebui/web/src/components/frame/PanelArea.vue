<script setup lang="ts">
import { X } from '@lucide/vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { iconComponent } from '../../contributions/icons.ts';
import { panelMemory, useKvwebui } from '../../state/kvwebui.ts';
import ViewNode from '../views/ViewNode.vue';

// Panels (plan 06 §6.2): one open at a time, chosen from the strip, remembered per tab, shown on every page.
const state = useKvwebui();
const { t } = useI18n();
const panels = computed(() => state.registry.value.panels);
const open = computed(() => panels.value.find((panel) => panel.id === state.panel.value));

const choose = (id: string | null): void => {
  state.panel.value = id;
  panelMemory.write(id);
};
</script>

<template>
  <aside v-if="open" class="flex w-80 shrink-0 flex-col border-s border-line bg-surface" :aria-label="t(open.title)" :data-test="`panel-${open.id}`">
    <div class="flex h-13 items-center gap-2.5 border-b border-line px-4">
      <span class="grow font-semibold">{{ t(open.title) }}</span>
      <button type="button" class="grid size-9 place-items-center rounded-xl" :aria-label="t('kvwebui.panel.close')" @click="choose(null)"><X class="size-4.5" aria-hidden="true" /></button>
    </div>
    <div class="flex grow flex-col gap-4 overflow-auto p-4"><ViewNode :view="open.view" :scope="{}" /></div>
  </aside>
  <aside v-if="panels.length > 0" class="flex w-13 shrink-0 flex-col items-center gap-1.5 border-s border-line bg-sunken py-3" :aria-label="t('kvwebui.panel.strip')" data-test="panel-strip">
    <button
      v-for="panel in panels"
      :key="panel.id"
      type="button"
      class="grid size-10 place-items-center rounded-xl text-neutral-ink"
      :class="panel.id === state.panel.value ? 'bg-accent-soft text-accent-ink' : ''"
      :aria-label="t(panel.title)"
      :aria-pressed="panel.id === state.panel.value"
      :data-test="`panel-button-${panel.id}`"
      @click="choose(panel.id === state.panel.value ? null : panel.id)"
    >
      <component :is="iconComponent(panel.icon)" class="size-4.5" aria-hidden="true" />
    </button>
  </aside>
</template>

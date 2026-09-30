<script setup lang="ts">
import { Check, Monitor, Moon, Sun } from '@lucide/vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { problemOf } from '../../api/client.ts';
import { currentTheme, setTheme, type Theme } from '../../state/appearance.ts';
import { showProblem, useKvwebui } from '../../state/kvwebui.ts';
import DropdownMenu from '../shared/DropdownMenu.vue';

// The theme menu (plan 06 §6.2, ADR 0009, 75): System, Light, or Dark, saved as the global `kvwebui.theme`.
const state = useKvwebui();
const { t } = useI18n();
const themes: { theme: Theme; icon: typeof Sun }[] = [
  { theme: 'system', icon: Monitor },
  { theme: 'light', icon: Sun },
  { theme: 'dark', icon: Moon },
];
const active = computed(() => currentTheme(state));
const activeIcon = computed(() => themes.find((entry) => entry.theme === active.value)?.icon ?? Monitor);

const choose = async (theme: Theme, close: () => void): Promise<void> => {
  close();
  await setTheme(state, theme).catch((error: unknown) => showProblem(state, problemOf(error)));
};
</script>

<template>
  <DropdownMenu :label="t('kvwebui.theme.label', { theme: t(`kvwebui.theme.${active}`) })" width="w-44">
    <template #trigger>
      <component :is="activeIcon" class="size-4.5" aria-hidden="true" />
    </template>
    <template #default="{ close }">
      <button
        v-for="entry in themes"
        :key="entry.theme"
        type="button"
        role="menuitem"
        class="flex min-h-11 items-center gap-2.5 rounded-lg px-2.5 text-start"
        :class="entry.theme === active ? 'bg-neutral-soft' : ''"
        :data-test="`theme-${entry.theme}`"
        @click="choose(entry.theme, close)"
      >
        <component :is="entry.icon" class="size-4.5" aria-hidden="true" />
        <span class="grow">{{ t(`kvwebui.theme.${entry.theme}`) }}</span>
        <Check v-if="entry.theme === active" class="size-4.5 text-primary" aria-hidden="true" />
      </button>
    </template>
  </DropdownMenu>
</template>

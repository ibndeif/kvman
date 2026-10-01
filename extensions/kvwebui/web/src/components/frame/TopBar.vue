<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import LanguageMenu from './LanguageMenu.vue';
import ThemeMenu from './ThemeMenu.vue';
import WorkspacePicker from './WorkspacePicker.vue';

const props = defineProps<{ title: string }>();
const { t } = useI18n();
</script>

<template>
  <header class="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface px-3 md:px-4">
    <div class="flex items-center gap-2.5 text-[15px] font-semibold md:min-w-51">
      <span class="grid size-7 place-items-center rounded-lg bg-primary text-xs font-semibold text-on-primary" aria-hidden="true">kv</span>
      <span class="hidden sm:inline" data-test="app-title">{{ t(props.title) }}</span>
    </div>
    <WorkspacePicker />
    <div class="grow" />
    <LanguageMenu />
    <ThemeMenu />
  </header>
</template>

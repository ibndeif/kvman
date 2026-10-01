<script setup lang="ts">
import { Check, Globe } from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import { problemOf } from '../../api/client.ts';
import { directionOf, languageName, setLanguage } from '../../state/appearance.ts';
import { useI18nState } from '../../state/i18n.ts';
import { showProblem, useKvwebui } from '../../state/kvwebui.ts';
import DropdownMenu from '../shared/DropdownMenu.vue';

// The language menu (plan 06 §6.2): the languages the loaded catalogs have, each named in itself.
const state = useKvwebui();
const i18n = useI18nState();
const { t } = useI18n();

const choose = async (language: string, close: () => void): Promise<void> => {
  close();
  await setLanguage(state, i18n, language).catch((error: unknown) => showProblem(state, problemOf(error)));
};
</script>

<template>
  <DropdownMenu :label="t('kvwebui.language.label')" width="w-48">
    <template #trigger>
      <Globe class="size-4.5" aria-hidden="true" />
      <span class="hidden sm:inline" data-test="language-current">{{ languageName(state.language.value) }}</span>
    </template>
    <template #default="{ close }">
      <button
        v-for="language in state.health.value?.languages ?? []"
        :key="language"
        type="button"
        role="menuitem"
        :lang="language"
        :dir="directionOf(language)"
        class="flex min-h-11 items-center gap-2.5 rounded-lg px-2.5 text-start"
        :class="language === state.language.value ? 'bg-neutral-soft' : ''"
        :data-test="`language-${language}`"
        @click="choose(language, close)"
      >
        <span class="grow">{{ languageName(language) }}</span>
        <Check v-if="language === state.language.value" class="size-4.5 text-primary" aria-hidden="true" />
      </button>
    </template>
  </DropdownMenu>
</template>

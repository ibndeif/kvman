<script setup lang="ts">
import { Search } from '@lucide/vue';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { workspaceName } from '../../state/extension-text.ts';
import { useKvwebui } from '../../state/kvwebui.ts';
import { settingMatches } from '../../state/setting-text.ts';
import SettingRow from './SettingRow.vue';

// The Settings page (plan 06 §6.6, ADR 0014, 1): kvman's own settings, which are global, with a search box. Each
// extension's settings are on its own page.
const state = useKvwebui();
const translator = useI18n();
const { t } = translator;
const search = ref('');
const settings = computed(() => state.settings.value.filter((setting) => setting.key.startsWith('kernel.') && settingMatches(translator, setting, search.value)));
</script>

<template>
  <div class="flex flex-col gap-3.5">
    <div class="flex flex-col gap-1.5">
      <h1 class="m-0 text-[26px] font-semibold tracking-tight">{{ t('kvwebui.pages.settings') }}</h1>
      <p class="m-0 text-muted">
        {{ t('kvwebui.settings.intro') }}
        <RouterLink to="/kvwebui/extensions" class="font-medium text-primary" data-test="settings-extensions">{{ t('kvwebui.settings.extensionsLink') }}</RouterLink>
      </p>
    </div>
    <label class="flex h-9.5 items-center gap-2 rounded-xl border border-line bg-surface px-3">
      <Search class="size-4 shrink-0 text-muted" aria-hidden="true" />
      <input v-model="search" type="search" class="min-w-0 grow bg-transparent outline-none" :placeholder="t('kvwebui.settings.search')" :aria-label="t('kvwebui.settings.search')" data-test="settings-search" />
    </label>
    <section v-if="settings.length > 0" class="rounded-2xl border border-line bg-surface" data-test="settings-general">
      <SettingRow v-for="setting in settings" :key="setting.key" class="px-5" :setting="setting" scope="global" :workspace-name="workspaceName(state)" />
    </section>
    <p v-else class="m-0 text-muted" data-test="settings-none">{{ t('kvwebui.settings.noMatch') }}</p>
  </div>
</template>

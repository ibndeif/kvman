<script setup lang="ts">
import { Search } from '@lucide/vue';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { SettingInfo } from '../../api/kernel.ts';
import { useKvwebui } from '../../state/kvwebui.ts';
import type { Scope } from '../../state/setting-save.ts';
import { settingMatches } from '../../state/setting-text.ts';
import SecretsSection from './SecretsSection.vue';
import SettingRow from './SettingRow.vue';

// The Settings page (plan 06 §6.6, ADR 0009, 77; ADR 0013, 2 and 6): one switch says where changes are stored, a search
// box filters the keys, and every key is grouped by namespace with kvman's own first, then the secrets.
const state = useKvwebui();
const translator = useI18n();
const { t, te } = translator;
const scope = ref<Scope>('global');
const search = ref('');
const workspaceName = computed(() => state.workspaces.value.find((workspace) => workspace.id === state.workspace.value)?.name ?? state.workspace.value);
const namespaceOf = (key: string): string => key.slice(0, key.indexOf('.'));
const groups = computed(() => {
  const byNamespace = new Map<string, SettingInfo[]>();
  for (const setting of state.settings.value) {
    if (settingMatches(translator, setting, search.value)) byNamespace.set(namespaceOf(setting.key), [...(byNamespace.get(namespaceOf(setting.key)) ?? []), setting]);
  }
  return [...byNamespace.entries()]
    .sort(([first], [second]) => (first === 'kernel' ? -1 : second === 'kernel' ? 1 : first.localeCompare(second)))
    .map(([namespace, settings]) => ({ namespace, settings }));
});
const searching = computed(() => search.value.trim() !== '');
const heading = (namespace: string): string => {
  if (!te(`${namespace}.title`)) return namespace;
  return namespace === 'kernel' ? t('kernel.title') : `${t(`${namespace}.title`)} (${namespace})`;
};
const scopeText = (choice: Scope): string => t(`kvwebui.settings.scope.${choice}`, { name: workspaceName.value });
</script>

<template>
  <div class="flex gap-8">
    <nav class="sticky top-0 hidden w-40 shrink-0 flex-col gap-0.5 self-start pt-19 lg:flex" :aria-label="t('kvwebui.settings.groups')">
      <a v-for="group in groups" :key="group.namespace" :href="`#settings-${group.namespace}`" class="flex h-8 items-center rounded-lg px-2.5 text-neutral-ink hover:bg-neutral-soft">{{ heading(group.namespace) }}</a>
      <a v-if="!searching" href="#settings-secrets" class="flex h-8 items-center rounded-lg px-2.5 text-neutral-ink hover:bg-neutral-soft">{{ t('kvwebui.secrets.title') }}</a>
    </nav>
    <div class="flex min-w-0 grow flex-col gap-3.5">
      <div class="flex flex-col gap-1.5">
        <h1 class="m-0 text-[26px] font-semibold tracking-tight">{{ t('kvwebui.pages.settings') }}</h1>
        <p class="m-0 text-muted">{{ t('kvwebui.settings.intro') }}</p>
      </div>
      <div class="flex flex-wrap items-center gap-3 pb-1.5">
        <div role="group" :aria-label="t('kvwebui.settings.appliesTo')" class="flex gap-0.5 rounded-xl bg-neutral-soft p-0.75">
          <button
            v-for="choice in (['global', 'workspace'] as const)"
            :key="choice"
            type="button"
            class="h-8 max-w-60 truncate rounded-lg px-3.5 text-[13px]"
            :class="scope === choice ? 'bg-surface font-medium text-ink shadow-sm' : 'text-neutral-ink'"
            :aria-pressed="scope === choice"
            :data-test="`scope-${choice}`"
            @click="scope = choice"
          >
            {{ scopeText(choice) }}
          </button>
        </div>
        <label class="flex h-9.5 min-w-56 grow items-center gap-2 rounded-xl border border-line bg-surface px-3">
          <Search class="size-4 shrink-0 text-muted" aria-hidden="true" />
          <input v-model="search" type="search" class="min-w-0 grow bg-transparent outline-none" :placeholder="t('kvwebui.settings.search')" :aria-label="t('kvwebui.settings.search')" data-test="settings-search" />
        </label>
      </div>
      <template v-for="group in groups" :key="group.namespace">
        <h2 :id="`settings-${group.namespace}`" class="m-0 pt-2 text-[13px] font-semibold tracking-wide text-muted uppercase" :data-test="`group-${group.namespace}`">{{ heading(group.namespace) }}</h2>
        <section class="rounded-2xl border border-line bg-surface">
          <SettingRow v-for="setting in group.settings" :key="setting.key" :setting="setting" :scope="scope" :workspace-name="workspaceName" />
        </section>
      </template>
      <p v-if="searching && groups.length === 0" class="m-0 text-muted" data-test="settings-none">{{ t('kvwebui.settings.noMatch') }}</p>
      <SecretsSection v-if="!searching" />
    </div>
  </div>
</template>

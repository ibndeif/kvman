<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { SettingInfo } from '../../api/kernel.ts';
import { useKvwebui } from '../../state/kvwebui.ts';
import SecretsSection from './SecretsSection.vue';
import SettingRow from './SettingRow.vue';

// The Settings page (plan 06 §6.6, ADR 0009, 77): every key, grouped by namespace with kvman's own first, then secrets.
const state = useKvwebui();
const { t, te } = useI18n();
const namespaceOf = (key: string): string => key.slice(0, key.indexOf('.'));
const groups = computed(() => {
  const byNamespace = new Map<string, SettingInfo[]>();
  for (const setting of state.settings.value) byNamespace.set(namespaceOf(setting.key), [...(byNamespace.get(namespaceOf(setting.key)) ?? []), setting]);
  return [...byNamespace.entries()]
    .sort(([first], [second]) => (first === 'kernel' ? -1 : second === 'kernel' ? 1 : first.localeCompare(second)))
    .map(([namespace, settings]) => ({ namespace, settings }));
});
const heading = (namespace: string): string => {
  if (!te(`${namespace}.title`)) return namespace;
  return namespace === 'kernel' ? t('kernel.title') : `${t(`${namespace}.title`)} (${namespace})`;
};
</script>

<template>
  <div class="flex gap-8">
    <nav class="hidden w-40 shrink-0 flex-col gap-0.5 pt-19 lg:flex" :aria-label="t('kvwebui.settings.groups')">
      <a v-for="group in groups" :key="group.namespace" :href="`#settings-${group.namespace}`" class="flex h-8 items-center rounded-lg px-2.5 text-neutral-ink">{{ heading(group.namespace) }}</a>
      <a href="#settings-secrets" class="flex h-8 items-center rounded-lg px-2.5 text-neutral-ink">{{ t('kvwebui.secrets.title') }}</a>
    </nav>
    <div class="flex min-w-0 grow flex-col gap-3.5">
      <div class="flex flex-col gap-1.5 pb-1.5">
        <h1 class="m-0 text-[26px] font-semibold tracking-tight">{{ t('kvwebui.pages.settings') }}</h1>
        <p class="m-0 text-muted">{{ t('kvwebui.settings.intro') }}</p>
      </div>
      <template v-for="group in groups" :key="group.namespace">
        <h2 :id="`settings-${group.namespace}`" class="m-0 pt-2 text-[13px] font-semibold tracking-wide text-muted uppercase" :data-test="`group-${group.namespace}`">{{ heading(group.namespace) }}</h2>
        <section class="rounded-2xl border border-line bg-surface">
          <SettingRow v-for="setting in group.settings" :key="setting.key" :setting="setting" />
        </section>
      </template>
      <SecretsSection />
    </div>
  </div>
</template>

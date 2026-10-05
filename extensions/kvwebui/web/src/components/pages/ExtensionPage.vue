<script setup lang="ts">
import { ChevronLeft } from '@lucide/vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import { extensionTitle, pathExtension, workspaceName } from '../../state/extension-text.ts';
import { useKvwebui } from '../../state/kvwebui.ts';
import { pendingChanges, sourceKey } from '../../state/preset.ts';
import { provideSettingsScope } from '../../state/settings-scope.ts';
import ViewNode from '../views/ViewNode.vue';
import NotFoundPage from './NotFoundPage.vue';
import RemoveExtension from './RemoveExtension.vue';
import ScopeSwitch from './ScopeSwitch.vue';
import SecretsSection from './SecretsSection.vue';

// An extension's page (plan 06 §6.6, ADR 0014, 4): what it is, "Remove", the configuration the extension gives under
// one scope switch, and its secrets. The extension manages its configuration; kvwebui only shows it.
const state = useKvwebui();
const route = useRoute();
const translator = useI18n();
const { t } = translator;
const scope = provideSettingsScope();
const extension = computed(() => pathExtension(state, route.path));
const configuration = computed(() => (extension.value === undefined ? undefined : state.registry.value.configurations.get(extension.value.namespace)));
const removed = computed(() => extension.value !== undefined && pendingChanges(state).removed.has(extension.value.name));
</script>

<template>
  <div v-if="extension" class="flex flex-col gap-4" :data-test="`extension-page-${extension.namespace}`">
    <RouterLink to="/kvwebui/extensions" class="flex w-fit items-center gap-1 font-medium text-primary" data-test="extension-back">
      <ChevronLeft class="size-4 rtl:-scale-x-100" aria-hidden="true" />{{ t('kvwebui.pages.extensions') }}
    </RouterLink>
    <div class="flex flex-wrap items-start gap-4">
      <div class="flex min-w-0 grow flex-col gap-1.5">
        <h1 class="m-0 text-[26px] font-semibold tracking-tight" data-test="extension-title">{{ extensionTitle(translator, extension) }}</h1>
        <div class="flex flex-wrap items-center gap-2 text-muted">
          <span dir="ltr" class="font-mono text-[13px]" data-test="extension-name">{{ extension.name }}</span>
          <span dir="ltr" class="font-mono text-[13px]" data-test="extension-version">{{ extension.version }}</span>
          <span class="rounded-full bg-neutral-soft px-2.5 py-0.5 text-xs font-medium text-neutral-ink" data-test="extension-source">{{ t(sourceKey(extension.source)) }}</span>
          <span v-if="removed" class="rounded-full bg-warning-soft px-2.5 py-0.5 text-xs font-medium text-warning-ink" data-test="extension-mark">{{ t('kvwebui.extensions.mark.removed') }}</span>
        </div>
      </div>
      <RemoveExtension v-if="!removed" :name="extension.name" />
    </div>
    <template v-if="configuration">
      <ScopeSwitch v-model="scope" :workspace-name="workspaceName(state)" />
      <ViewNode :key="extension.namespace" :view="configuration" :scope="{ params: {} }" />
    </template>
    <p v-else class="m-0 text-muted" data-test="extension-nothing">{{ t('kvwebui.extension.nothing') }}</p>
    <SecretsSection :key="extension.name" :extension="extension.name" />
  </div>
  <NotFoundPage v-else />
</template>

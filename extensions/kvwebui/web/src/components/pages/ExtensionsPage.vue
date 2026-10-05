<script setup lang="ts">
import type { Problem } from '@kvman/sdk';
import { Search } from '@lucide/vue';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { extensionTitle } from '../../state/extension-text.ts';
import { useKvwebui } from '../../state/kvwebui.ts';
import { pendingChanges } from '../../state/preset.ts';
import ErrorCard from '../shared/ErrorCard.vue';
import AddExtension from './AddExtension.vue';
import ExtensionCard from './ExtensionCard.vue';
import PendingExtensionCard from './PendingExtensionCard.vue';

// The Extensions page (plan 06 §6.6, ADR 0010, 5, ADR 0014, 4): each extension as a link to its own page, with what the
// stored preset changes at the next restart, and the form that adds an extension. At `/` without a home page it
// carries the HOME_UNAVAILABLE card (§6.3).
const props = defineProps<{ homeUnavailable?: { page: string; problem: Problem | undefined } }>();
const state = useKvwebui();
const translator = useI18n();
const { t } = translator;
const search = ref('');
const needle = computed(() => search.value.trim().toLowerCase());
const shown = computed(() => state.extensions.value.filter((extension) => [extensionTitle(translator, extension), extension.name].some((text) => text.toLowerCase().includes(needle.value))));
const pending = computed(() => pendingChanges(state));
const changes = computed(() => pending.value.starting.length + pending.value.removed.size);
</script>

<template>
  <div class="flex flex-col gap-4">
    <ErrorCard
      v-if="props.homeUnavailable"
      :problem="props.homeUnavailable.problem"
      title="kvwebui.errors.HOME_UNAVAILABLE"
      :title-params="{ page: props.homeUnavailable.page }"
      data-test="home-unavailable"
    />
    <div class="flex flex-wrap items-end gap-4">
      <div class="flex grow flex-col gap-1.5">
        <h1 class="m-0 text-[26px] font-semibold tracking-tight">{{ t('kvwebui.pages.extensions') }}</h1>
        <p class="m-0 text-muted">{{ t('kvwebui.extensions.intro', { count: String(state.extensions.value.length), preset: state.health.value?.preset ?? '' }) }}</p>
      </div>
      <label class="flex h-9 w-65 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-muted">
        <Search class="size-4" aria-hidden="true" />
        <input v-model="search" type="search" class="w-full bg-transparent text-ink outline-none" :placeholder="t('kvwebui.extensions.search')" :aria-label="t('kvwebui.extensions.search')" data-test="extensions-search" />
      </label>
    </div>
    <div v-if="changes > 0" role="status" class="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-accent-soft px-4.5 py-3 text-accent-ink" data-test="restart-banner">
      <span class="font-semibold">{{ t('kvwebui.extensions.banner') }}</span>
      <span>{{ t('kvwebui.extensions.banner.count', { count: String(changes) }) }}</span>
    </div>
    <ErrorCard v-if="state.presetProblem.value" :problem="state.presetProblem.value" title="kvwebui.extensions.presetFailed" data-test="preset-error" />
    <ExtensionCard v-for="extension in shown" :key="extension.name" :extension="extension" :removed="pending.removed.has(extension.name)" />
    <p v-if="shown.length === 0" class="m-0 text-muted" data-test="extensions-none">{{ t('kvwebui.extensions.noMatch') }}</p>
    <PendingExtensionCard v-for="extension in pending.starting" :key="extension.name" :name="extension.name" :source="extension.source" />
    <AddExtension />
  </div>
</template>

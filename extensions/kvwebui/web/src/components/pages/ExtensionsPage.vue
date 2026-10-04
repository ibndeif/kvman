<script setup lang="ts">
import type { Problem } from '@kvman/sdk';
import { Search } from '@lucide/vue';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useKvwebui } from '../../state/kvwebui.ts';
import { pendingChanges } from '../../state/preset.ts';
import ErrorCard from '../shared/ErrorCard.vue';
import AddExtension from './AddExtension.vue';
import ExtensionCard from './ExtensionCard.vue';
import PendingExtensionCard from './PendingExtensionCard.vue';

// The Extensions page (plan 06 §6.6, ADR 0009, 78, ADR 0010, 5): one card per extension, with what the stored preset
// changes at the next restart, and the form that adds an extension. At `/` without a home page it carries the
// HOME_UNAVAILABLE card (§6.3).
const props = defineProps<{ homeUnavailable?: { page: string; problem: Problem | undefined } }>();
const state = useKvwebui();
const { t } = useI18n();
const search = ref('');
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
    <AddExtension />
    <ExtensionCard v-for="extension in state.extensions.value" :key="extension.name" :extension="extension" :search="search" :removed="pending.removed.has(extension.name)" />
    <PendingExtensionCard v-for="extension in pending.starting" :key="extension.name" :name="extension.name" :source="extension.source" />
  </div>
</template>

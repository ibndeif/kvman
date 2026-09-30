<script setup lang="ts">
import type { Problem } from '@kvman/sdk';
import { Search } from '@lucide/vue';
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useKvwebui } from '../../state/kvwebui.ts';
import ErrorCard from '../shared/ErrorCard.vue';
import ExtensionCard from './ExtensionCard.vue';

// The Extensions page (plan 06 §6.6, ADR 0009, 78): read-only, one card per extension. At `/` without a home page it
// carries the HOME_UNAVAILABLE card (§6.3).
const props = defineProps<{ homeUnavailable?: { page: string; problem: Problem | undefined } }>();
const state = useKvwebui();
const { t } = useI18n();
const search = ref('');
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
    <ExtensionCard v-for="extension in state.extensions.value" :key="extension.name" :extension="extension" :search="search" />
  </div>
</template>

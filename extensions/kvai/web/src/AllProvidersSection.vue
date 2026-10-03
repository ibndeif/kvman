<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import ProviderAvatar from './ProviderAvatar.vue';
import { useKvman } from './kvman.ts';
import { unconnectedBuiltIns, type ProviderRow } from './provider-groups.ts';

// "All providers" (plan 07 §7.3, ADR 0009, 242): the unconnected built-ins, A–Z, with search.
const props = defineProps<{ rows: ProviderRow[] }>();
const kvman = useKvman();

const search = ref('');
const shown = ref(25);

const candidates = computed(() => unconnectedBuiltIns(props.rows));
const matched = computed(() => {
  const needle = search.value.trim().toLocaleLowerCase();
  if (needle === '') return candidates.value;
  return candidates.value.filter(
    (row) => row.title.toLocaleLowerCase().includes(needle) || row.id.toLocaleLowerCase().includes(needle),
  );
});
const visible = computed(() => matched.value.slice(0, shown.value));

watch(search, () => {
  shown.value = 25;
});

function more(): void {
  shown.value += 25;
}

function openProvider(providerId: string): void {
  kvman.navigate('kvai.provider', { providerId });
}
</script>

<template>
  <section data-test="all-section" :aria-label="kvman.t('kvai.ui.providers.all')">
    <div class="kvai-section-head">
      <h2 class="kvai-section-title">{{ kvman.t('kvai.ui.providers.all') }}</h2>
      <span class="kvai-muted" data-test="all-count">{{ kvman.t('kvai.ui.providers.allCount', { count: String(candidates.length) }) }}</span>
      <span class="kvai-spacer"></span>
      <span class="kvai-search">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <label class="kvai-hidden" for="kvai-all-search">{{ kvman.t('kvai.ui.providers.searchLabel') }}</label>
        <input
          id="kvai-all-search"
          v-model="search"
          type="search"
          class="kvai-search-input"
          data-test="all-search"
          :placeholder="kvman.t('kvai.ui.providers.searchPlaceholder', { count: String(candidates.length) })"
        />
      </span>
    </div>
    <div v-if="visible.length > 0" class="kvai-card kvai-list">
      <div v-for="row in visible" :key="row.id" class="kvai-row" data-test="all-row">
        <ProviderAvatar :provider-id="row.id" :title="row.title" size="sm" />
        <span class="kvai-row-title">{{ row.title }}</span>
        <span class="kvai-muted" data-test="all-models">{{ kvman.t('kvai.ui.providers.modelCount', { count: String(row.models) }) }}</span>
        <button type="button" class="kvai-link" data-test="connect" @click="openProvider(row.id)">
          {{ kvman.t('kvai.ui.providers.connectAction') }}
        </button>
      </div>
    </div>
    <p v-else class="kvai-muted" data-test="all-empty" role="status">{{ kvman.t('kvai.ui.providers.noMatch') }}</p>
    <button v-if="visible.length < matched.length" type="button" class="kvai-button kvai-more" data-test="all-more" @click="more">
      {{ kvman.t('kvai.ui.providers.showMore', { count: '25' }) }}
    </button>
  </section>
</template>

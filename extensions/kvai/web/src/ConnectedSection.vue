<script setup lang="ts">
import { computed } from 'vue';
import ProviderAvatar from './ProviderAvatar.vue';
import { useKvman } from './kvman.ts';
import { connectedRows, providerOf, type DefaultModel, type ProviderRow } from './provider-groups.ts';

// "Connected" (plan 07 §7.3, ADR 0009, 240): a card for each usable provider, with Manage.
const props = defineProps<{ rows: ProviderRow[]; defaultModel: DefaultModel | null }>();
const kvman = useKvman();

const connected = computed(() => connectedRows(props.rows));
const defaultProvider = computed(() =>
  props.defaultModel?.id === null || props.defaultModel?.id === undefined ? null : providerOf(props.defaultModel.id),
);

function lineKey(row: ProviderRow): string {
  if (!row.builtIn) return 'kvai.ui.providers.ownServer';
  return row.connection === 'oauth' ? 'kvai.ui.connection.connectedPlan' : 'kvai.ui.connection.connectedKey';
}

function openProvider(providerId: string): void {
  kvman.navigate('kvai.provider', { providerId });
}
</script>

<template>
  <section data-test="connected-section" :aria-label="kvman.t('kvai.ui.providers.connected')">
    <div class="kvai-section-head">
      <h2 class="kvai-section-title">{{ kvman.t('kvai.ui.providers.connected') }}</h2>
      <span class="kvai-muted" data-test="connected-count">{{ kvman.t('kvai.ui.providers.connectedCount', { count: String(connected.length) }) }}</span>
    </div>
    <div v-if="connected.length > 0" class="kvai-grid-connected">
      <article v-for="row in connected" :key="row.id" class="kvai-card" data-test="connected-card">
        <div class="kvai-line">
          <ProviderAvatar :provider-id="row.id" :title="row.title" size="md" />
          <div class="kvai-stack">
            <span class="kvai-card-title">{{ row.title }}</span>
            <span class="kvai-muted" data-test="connected-models">{{ kvman.t('kvai.ui.providers.modelCount', { count: String(row.models) }) }}</span>
          </div>
          <span v-if="row.id === defaultProvider" class="kvai-chip" data-test="connected-default" data-tone="info">{{
            kvman.t('kvai.ui.models.default')
          }}</span>
        </div>
        <p class="kvai-line-text" data-test="connected-line">
          <svg
            v-if="row.builtIn"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
            class="kvai-check"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
          {{ kvman.t(lineKey(row)) }}
        </p>
        <button type="button" class="kvai-button" data-test="manage" @click="openProvider(row.id)">
          {{ kvman.t('kvai.ui.providers.manage') }}
        </button>
      </article>
    </div>
    <p v-else class="kvai-card kvai-dashed kvai-muted" data-test="connected-empty">{{ kvman.t('kvai.ui.providers.nothingConnected') }}</p>
  </section>
</template>

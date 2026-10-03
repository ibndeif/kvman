<script setup lang="ts">
import { computed } from 'vue';
import ProviderAvatar from './ProviderAvatar.vue';
import { useKvman } from './kvman.ts';
import { featuredTiles, type ProviderRow } from './provider-groups.ts';

// "Connect a provider" (plan 07 §7.3, ADR 0009, 241): the fixed quick-connect tiles.
const props = defineProps<{ rows: ProviderRow[] }>();
const kvman = useKvman();

const tiles = computed(() => featuredTiles(props.rows));
const titleOf = (providerId: string): string => props.rows.find((row) => row.id === providerId)?.title ?? providerId;

function openProvider(providerId: string): void {
  kvman.navigate('kvai.provider', { providerId });
}

function openAdd(): void {
  kvman.navigate('kvai.provider-add');
}
</script>

<template>
  <section data-test="connect-section" :aria-label="kvman.t('kvai.ui.providers.connect')">
    <div class="kvai-section-head-col">
      <h2 class="kvai-section-title">{{ kvman.t('kvai.ui.providers.connect') }}</h2>
      <p class="kvai-muted kvai-sub">{{ kvman.t('kvai.ui.providers.connectIntro') }}</p>
    </div>
    <div v-if="tiles.plan.length > 0" class="kvai-group">
      <span class="kvai-eyebrow">{{ kvman.t('kvai.ui.providers.withPlan') }}</span>
      <div class="kvai-grid-plan">
        <button v-for="tile in tiles.plan" :key="tile.provider" type="button" class="kvai-card kvai-tile" data-test="plan-tile" @click="openProvider(tile.provider)">
          <span class="kvai-line">
            <ProviderAvatar :provider-id="tile.provider" :title="titleOf(tile.provider)" size="md" />
            <span class="kvai-stack">
              <span class="kvai-card-title">{{ kvman.t(tile.name) }}</span>
              <span v-if="tile.note !== undefined" class="kvai-muted">{{ kvman.t(tile.note) }}</span>
            </span>
          </span>
          <span class="kvai-action">{{ kvman.t('kvai.ui.connection.signin') }}</span>
        </button>
      </div>
    </div>
    <div class="kvai-group">
      <span class="kvai-eyebrow">{{ kvman.t('kvai.ui.providers.withKey') }}</span>
      <div class="kvai-grid-key">
        <button v-for="tile in tiles.key" :key="tile.provider" type="button" class="kvai-card kvai-tile-small" data-test="key-tile" @click="openProvider(tile.provider)">
          <ProviderAvatar :provider-id="tile.provider" :title="titleOf(tile.provider)" size="sm" />
          <span class="kvai-tile-name">{{ kvman.t(tile.name) }}</span>
        </button>
        <button type="button" class="kvai-card kvai-tile-small kvai-dashed" data-test="own-server-tile" @click="openAdd">
          <span class="kvai-plus" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </span>
          <span class="kvai-stack">
            <span class="kvai-tile-name">{{ kvman.t('kvai.ui.providers.ownServer') }}</span>
            <span class="kvai-muted">{{ kvman.t('kvai.ui.providers.ownServerNote') }}</span>
          </span>
        </button>
      </div>
    </div>
  </section>
</template>

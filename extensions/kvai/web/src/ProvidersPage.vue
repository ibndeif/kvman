<script setup lang="ts">
import AllProvidersSection from './AllProvidersSection.vue';
import ConnectSection from './ConnectSection.vue';
import ConnectedSection from './ConnectedSection.vue';
import DefaultCard from './DefaultCard.vue';
import { useKvman } from './kvman.ts';
import { useProviders } from './use-providers.ts';

// The Models page (plan 07 §7.3, ADR 0009, 238): the default-model card, Connected, Connect a provider, All providers.
const kvman = useKvman();
const { rows, defaultModel, loading, failure, reload } = useProviders();
</script>

<template>
  <div class="kvai-providers">
    <p v-if="loading" class="kvai-text" data-test="providers-loading" role="status">{{ kvman.t('kvai.ui.connection.loading') }}</p>
    <p v-else-if="failure !== null" class="kvai-error" data-test="providers-error" role="alert">
      {{ kvman.t(failure.key, failure.params) }}
    </p>
    <template v-else>
      <DefaultCard :rows="rows" :default-model="defaultModel" :on-picked="reload" />
      <ConnectedSection :rows="rows" :default-model="defaultModel" />
      <ConnectSection :rows="rows" />
      <AllProvidersSection :rows="rows" />
    </template>
  </div>
</template>

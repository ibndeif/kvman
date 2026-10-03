<script setup lang="ts">
import { computed } from 'vue';
import ProviderAvatar from './ProviderAvatar.vue';
import { useKvman } from './kvman.ts';
import type { ProviderRow } from './provider-row.ts';

// The Provider page's header (plan 07 §7.3, ADR 0009, 245): the back link, the avatar, the title, `<id> · N
// models`, and the connection chip.
const props = defineProps<{ row: ProviderRow }>();
const kvman = useKvman();

const tone = computed(() => (props.row.connection !== null ? 'success' : props.row.builtIn ? 'warning' : 'neutral'));
const chipKey = computed(() =>
  props.row.connection !== null
    ? 'kvai.ui.provider.connected'
    : props.row.builtIn
      ? 'kvai.ui.status.needsKey'
      : 'kvai.ui.providers.ownServer',
);

function back(): void {
  kvman.navigate('kvai.models');
}
</script>

<template>
  <div class="kvai-provider-head">
    <button type="button" class="kvai-link" data-test="back" @click="back">
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
        class="kvai-flip"
      >
        <path d="m15 18-6-6 6-6" />
      </svg>
      {{ kvman.t('kvai.ui.back') }}
    </button>
    <div class="kvai-provider-row">
      <ProviderAvatar :provider-id="props.row.id" :title="props.row.title" size="xl" />
      <div class="kvai-provider-titles">
        <h1 class="kvai-provider-title">{{ props.row.title }}</h1>
        <span class="kvai-muted kvai-default-meta" data-test="provider-sub"
          ><span class="kvai-mono">{{ props.row.id }}</span> · <span>{{ kvman.t('kvai.ui.providers.modelCount', { count: String(props.row.models) }) }}</span></span
        >
      </div>
      <span class="kvai-spacer"></span>
      <span class="kvai-chip" data-test="provider-chip" :data-tone="tone">
        <svg
          v-if="props.row.connection !== null"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.4"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
        {{ kvman.t(chipKey) }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useKvman } from './kvman.ts';

// The connection badge and line (plan 07 §7.3): what the provider is connected by.
const props = defineProps<{ connection: 'apiKey' | 'oauth' | null; builtIn: boolean }>();
const kvman = useKvman();

const tone = computed(() => (props.connection === null ? (props.builtIn ? 'warning' : 'neutral') : 'success'));
const lineKey = computed(() => {
  if (props.connection === 'apiKey') return 'kvai.ui.connection.connectedKey';
  if (props.connection === 'oauth') return 'kvai.ui.connection.connectedPlan';
  return props.builtIn ? 'kvai.ui.connection.notConnected' : 'kvai.ui.connection.noKeyLocal';
});
</script>

<template>
  <div class="kvai-line">
    <span class="kvai-badge" :data-test="'connection-badge'" :data-tone="tone">{{ kvman.t(lineKey) }}</span>
    <p class="kvai-text" data-test="connection-line">{{ kvman.t(lineKey) }}</p>
  </div>
</template>

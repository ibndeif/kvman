<script setup lang="ts">
import { computed, ref } from 'vue';
import { failureOf, useKvman } from './kvman.ts';
import type { ProviderRow } from './provider-row.ts';

// The connected card (ADR 0009, 246): how the provider is connected, with Disconnect behind an inline
// confirmation. The caller reloads the row after a change.
const props = defineProps<{ row: ProviderRow; onChanged: () => Promise<void> }>();
const kvman = useKvman();
const confirming = ref(false);
const working = ref(false);
const failure = ref<{ key: string; params: Record<string, string> } | null>(null);

const titleKey = computed(() =>
  props.row.connection === 'oauth' ? 'kvai.ui.connection.connectedPlan' : 'kvai.ui.connection.connectedKey',
);
const lineKey = computed(() => (props.row.connection === 'oauth' ? 'kvai.ui.provider.planKeeps' : 'kvai.ui.key.help'));

async function disconnect(): Promise<void> {
  if (working.value) return;
  working.value = true;
  failure.value = null;
  try {
    await kvman.exec('kvai.provider.disconnect', { provider: props.row.id });
    confirming.value = false;
    await props.onChanged();
    kvman.refresh();
    kvman.toast('kvai.ui.connection.disconnected', {}, 'success');
  } catch (error) {
    failure.value = failureOf(error);
  } finally {
    working.value = false;
  }
}
</script>

<template>
  <div class="kvai-connected" data-test="connected-card">
    <p v-if="failure !== null" class="kvai-error" data-test="actions-error" role="alert">
      {{ kvman.t(failure.key, failure.params) }}
    </p>
    <div class="kvai-connected-row">
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.4"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
        class="kvai-check"
      >
        <path d="M20 6 9 17l-5-5" />
      </svg>
      <div class="kvai-stack">
        <h3 class="kvai-choice-title">{{ kvman.t(titleKey) }}</h3>
        <p class="kvai-text kvai-muted">{{ kvman.t(lineKey) }}</p>
      </div>
      <button type="button" class="kvai-button kvai-danger-outline" data-test="disconnect-button" @click="confirming = true">
        {{ kvman.t('kvai.ui.connection.disconnect') }}
      </button>
    </div>
    <div v-if="confirming" class="kvai-confirm" data-test="disconnect-confirm">
      <p class="kvai-text">{{ kvman.t('kvai.ui.connection.disconnectConfirm', { provider: row.title }) }}</p>
      <div class="kvai-actions">
        <button type="button" class="kvai-button" data-test="disconnect-cancel" @click="confirming = false">
          {{ kvman.t('kvai.ui.connection.cancel') }}
        </button>
        <button
          type="button"
          class="kvai-button kvai-danger"
          data-test="disconnect-confirm-button"
          :disabled="working"
          @click="disconnect"
        >
          {{ kvman.t('kvai.ui.connection.disconnect') }}
        </button>
      </div>
    </div>
  </div>
</template>

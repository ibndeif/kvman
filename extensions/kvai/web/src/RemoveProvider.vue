<script setup lang="ts">
import { ref } from 'vue';
import { failureOf, useKvman } from './kvman.ts';

// Remove provider for a custom provider (ADR 0009, 246): a low-emphasis danger button with an inline
// confirmation, then `kvai.provider.remove` and back to the Models page.
const props = defineProps<{ id: string; title: string }>();
const kvman = useKvman();
const confirming = ref(false);
const working = ref(false);
const failure = ref<{ key: string; params: Record<string, string> } | null>(null);

async function remove(): Promise<void> {
  if (working.value) return;
  working.value = true;
  failure.value = null;
  try {
    await kvman.exec('kvai.provider.remove', { id: props.id });
    confirming.value = false;
    kvman.toast('kvai.ui.connection.removed', {}, 'success');
    kvman.navigate('kvai.models');
  } catch (error) {
    failure.value = failureOf(error);
  } finally {
    working.value = false;
  }
}
</script>

<template>
  <div class="kvai-remove">
    <p v-if="failure !== null" class="kvai-error" data-test="actions-error" role="alert">
      {{ kvman.t(failure.key, failure.params) }}
    </p>
    <button type="button" class="kvai-button kvai-danger-quiet" data-test="remove-button" @click="confirming = true">
      {{ kvman.t('kvai.ui.connection.removeProvider') }}
    </button>
    <div v-if="confirming" class="kvai-confirm" data-test="remove-confirm">
      <p class="kvai-text">{{ kvman.t('kvai.ui.connection.removeConfirm', { provider: title }) }}</p>
      <div class="kvai-actions">
        <button type="button" class="kvai-button" data-test="remove-cancel" @click="confirming = false">
          {{ kvman.t('kvai.ui.connection.cancel') }}
        </button>
        <button
          type="button"
          class="kvai-button kvai-danger"
          data-test="remove-confirm-button"
          :disabled="working"
          @click="remove"
        >
          {{ kvman.t('kvai.ui.connection.removeProvider') }}
        </button>
      </div>
    </div>
  </div>
</template>

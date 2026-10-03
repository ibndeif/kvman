<script setup lang="ts">
import { ref } from 'vue';
import { failureOf, useKvman } from './kvman.ts';

// Disconnect and Remove provider (ADR 0009, 226): danger buttons with an inline confirmation.
const props = defineProps<{
  provider: string;
  title: string;
  connected: boolean;
  builtIn: boolean;
  onChanged: () => Promise<void>;
}>();
const kvman = useKvman();
const confirming = ref<'disconnect' | 'remove' | null>(null);
const working = ref(false);
const failure = ref<{ key: string; params: Record<string, string> } | null>(null);

async function disconnect(): Promise<void> {
  if (working.value) return;
  working.value = true;
  failure.value = null;
  try {
    await kvman.exec('kvai.provider.disconnect', { provider: props.provider });
    confirming.value = null;
    await props.onChanged();
    kvman.refresh();
    kvman.toast('kvai.ui.connection.disconnected', {}, 'success');
  } catch (error) {
    failure.value = failureOf(error);
  } finally {
    working.value = false;
  }
}

async function remove(): Promise<void> {
  if (working.value) return;
  working.value = true;
  failure.value = null;
  try {
    await kvman.exec('kvai.provider.remove', { id: props.provider });
    confirming.value = null;
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
  <div class="kvai-field">
    <p v-if="failure !== null" class="kvai-error" data-test="actions-error" role="alert">{{ kvman.t(failure.key, failure.params) }}</p>
    <div v-if="connected" class="kvai-actions">
      <button type="button" class="kvai-button kvai-danger" data-test="disconnect-button" @click="confirming = 'disconnect'">
        {{ kvman.t('kvai.ui.connection.disconnect') }}
      </button>
    </div>
    <div v-if="confirming === 'disconnect'" class="kvai-confirm" data-test="disconnect-confirm">
      <p class="kvai-text">{{ kvman.t('kvai.ui.connection.disconnectConfirm', { provider: title }) }}</p>
      <div class="kvai-actions">
        <button type="button" class="kvai-button" data-test="disconnect-cancel" @click="confirming = null">
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
    <div v-if="!builtIn" class="kvai-actions">
      <button type="button" class="kvai-button kvai-danger" data-test="remove-button" @click="confirming = 'remove'">
        {{ kvman.t('kvai.ui.connection.removeProvider') }}
      </button>
    </div>
    <div v-if="confirming === 'remove'" class="kvai-confirm" data-test="remove-confirm">
      <p class="kvai-text">{{ kvman.t('kvai.ui.connection.removeConfirm', { provider: title }) }}</p>
      <div class="kvai-actions">
        <button type="button" class="kvai-button" data-test="remove-cancel" @click="confirming = null">
          {{ kvman.t('kvai.ui.connection.cancel') }}
        </button>
        <button type="button" class="kvai-button kvai-danger" data-test="remove-confirm-button" :disabled="working" @click="remove">
          {{ kvman.t('kvai.ui.connection.removeProvider') }}
        </button>
      </div>
    </div>
  </div>
</template>

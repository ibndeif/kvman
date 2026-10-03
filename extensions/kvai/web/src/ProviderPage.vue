<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import ConnectionSection from './ConnectionSection.vue';
import ProviderHeader from './ProviderHeader.vue';
import ProviderModels from './ProviderModels.vue';
import { failureOf, useKvman } from './kvman.ts';
import { asRow, type ProviderRow } from './provider-row.ts';

// The Provider page (plan 07 §7.3, ADR 0009, 245): the header, the connection section, and the provider's
// models. An unknown provider shows its Problem.
const props = defineProps<{ providerId: string }>();
const kvman = useKvman();

const row = ref<ProviderRow | null>(null);
const loading = ref(true);
const failure = ref<{ key: string; params: Record<string, string> } | null>(null);

async function read(): Promise<void> {
  loading.value = true;
  failure.value = null;
  try {
    const answer = await kvman.exec('kvai.provider.get', { id: props.providerId });
    const parsed = asRow(answer);
    if (parsed === undefined) throw new Error(`Unexpected provider row for ${props.providerId}.`);
    row.value = parsed;
  } catch (error) {
    failure.value = failureOf(error);
    row.value = null;
  } finally {
    loading.value = false;
  }
}

onMounted(read);
watch(
  () => props.providerId,
  () => void read(),
);
</script>

<template>
  <div class="kvai-provider">
    <p v-if="loading" class="kvai-text" data-test="provider-loading" role="status">
      {{ kvman.t('kvai.ui.connection.loading') }}
    </p>
    <p v-else-if="failure !== null" class="kvai-error" data-test="provider-error" role="alert">
      {{ kvman.t(failure.key, failure.params) }}
    </p>
    <template v-else-if="row !== null">
      <ProviderHeader :row="row" />
      <ConnectionSection :key="row.id" :row="row" :on-changed="read" />
      <ProviderModels :provider-id="props.providerId" />
    </template>
  </div>
</template>

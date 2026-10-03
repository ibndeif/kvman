<script setup lang="ts">
import { computed, ref } from 'vue';
import ModelPicker from './ModelPicker.vue';
import ProviderAvatar from './ProviderAvatar.vue';
import { useKvman } from './kvman.ts';
import { providerOf, type DefaultModel, type ProviderRow } from './provider-groups.ts';
import { useModelPicker } from './use-model-picker.ts';

// The default-model card (plan 07 §7.3, ADR 0009, 239): what kvman uses, with its "Change model" picker (244).
const props = defineProps<{ rows: ProviderRow[]; defaultModel: DefaultModel | null; onPicked: () => Promise<void> }>();
const kvman = useKvman();
const changeButton = ref<HTMLButtonElement | null>(null);

const picker = useModelPicker({
  providers: () => props.rows,
  defaultId: () => props.defaultModel?.id ?? null,
  onPicked: () => props.onPicked(),
});

const hasDefault = computed(() => props.defaultModel !== null && props.defaultModel.id !== null);
const providerId = computed(() =>
  props.defaultModel?.id === null || props.defaultModel?.id === undefined ? null : providerOf(props.defaultModel.id),
);
const row = computed(() => (providerId.value === null ? undefined : props.rows.find((candidate) => candidate.id === providerId.value)));

const connectionKey = computed(() => {
  if (row.value !== undefined && !row.value.builtIn) return 'kvai.ui.providers.ownServer';
  if (row.value?.connection === 'oauth') return 'kvai.ui.connection.connectedPlan';
  if (row.value?.connection === 'apiKey') return 'kvai.ui.connection.connectedKey';
  return 'kvai.ui.connection.notConnected';
});
</script>

<template>
  <section class="kvai-card kvai-default" data-test="default-card" :aria-label="kvman.t('kvai.ui.providers.defaultLabel')">
    <template v-if="hasDefault && defaultModel !== null && defaultModel.id !== null">
      <div class="kvai-default-row">
        <ProviderAvatar :provider-id="providerId ?? ''" :title="row?.title ?? providerId ?? ''" size="lg" />
        <div class="kvai-default-text">
          <span class="kvai-eyebrow">{{ kvman.t('kvai.ui.providers.defaultLabel') }}</span>
          <span class="kvai-default-name">{{ defaultModel.name ?? defaultModel.id }}</span>
          <span class="kvai-muted kvai-default-meta" data-test="default-id"><span class="kvai-mono">{{ defaultModel.id }}</span> · <span>{{ kvman.t(connectionKey) }}</span></span>
        </div>
        <span class="kvai-chip" data-test="default-chip" :data-tone="defaultModel.ready ? 'success' : 'warning'">{{
          kvman.t(defaultModel.ready ? 'kvai.ui.status.ready' : 'kvai.ui.status.notReady')
        }}</span>
        <div class="kvai-default-action">
          <button
            ref="changeButton"
            type="button"
            class="kvai-button"
            data-test="change-model"
            aria-haspopup="dialog"
            :aria-expanded="picker.open.value ? 'true' : 'false'"
            @click="picker.togglePicker()"
          >
            {{ kvman.t('kvai.ui.picker.change') }}
          </button>
          <ModelPicker v-if="picker.open.value" :state="picker" :anchor="changeButton" />
        </div>
      </div>
    </template>
    <template v-else>
      <p class="kvai-text" data-test="default-empty">{{ kvman.t('kvai.ui.providers.noDefault') }}</p>
      <div class="kvai-default-action">
        <button
          ref="changeButton"
          type="button"
          class="kvai-button"
          data-test="change-model"
          aria-haspopup="dialog"
          :aria-expanded="picker.open.value ? 'true' : 'false'"
          @click="picker.togglePicker()"
        >
          {{ kvman.t('kvai.ui.picker.choose') }}
        </button>
        <ModelPicker v-if="picker.open.value" :state="picker" :anchor="changeButton" />
      </div>
    </template>
  </section>
</template>

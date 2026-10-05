<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { toastProblem, useKvman } from './kvman.ts';
import { modelGroups, type ModelRow, type ProviderRow } from './model-groups.ts';
import ModelPicker from './ModelPicker.vue';
import { useSetting } from './use-setting.ts';

// `kvcoder.model` in kvcoder's configuration (plan 08 §8.7, ADR 0015, 3, 7, and 9): the chat's model picker, with
// "Use the default model" first, saving into the scope the extension's page is set to.
const kvman = useKvman();
const setting = useSetting(kvman, 'kvcoder.model');
const providers = ref<ProviderRow[]>([]);
const models = ref<ModelRow[]>([]);
const fallback = ref<string | null>(null);

onMounted(async () => {
  try {
    const [providerRows, modelRows, defaultModel] = await Promise.all([kvman.exec('kvai.provider.list', {}), kvman.exec('kvai.model.list', {}), kvman.exec('kvai.model.default.get', {})]);
    providers.value = providerRows;
    models.value = modelRows;
    fallback.value = defaultModel.name ?? defaultModel.id;
  } catch (error) {
    toastProblem(kvman, error);
  }
});

const current = computed(() => (typeof setting.value.value === 'string' ? setting.value.value : null));
const groups = computed(() => modelGroups(providers.value, models.value, current.value));
const empty = computed(() => (fallback.value === null ? kvman.t('kvcoder.config.model.defaultUnset') : kvman.t('kvcoder.config.model.default', { name: fallback.value })));
const scoped = (key: string): string => kvman.t(`${key}.${kvman.scope.value}`, { name: kvman.workspace.value.name });
</script>

<template>
  <div class="kvc-setting" data-test="model-setting">
    <span class="kvc-setting-text">
      <span class="kvc-setting-title" data-test="model-setting-title">{{ kvman.t('kvcoder.model.title') }}</span>
      <span class="kvc-muted" data-test="model-setting-description">{{ kvman.t('kvcoder.model.description') }}</span>
    </span>
    <span class="kvc-setting-control">
      <ModelPicker :groups="groups" :current="current" :empty="empty" :none="kvman.t('kvcoder.config.model.useDefault')" :disabled="setting.locked.value || setting.saving.value" @pick="(modelId) => setting.set(modelId)" @none="setting.set(null)" />
      <span v-if="setting.locked.value" class="kvc-muted" data-test="model-own-value">{{ kvman.t('kvcoder.config.model.ownValue', { name: kvman.workspace.value.name }) }}</span>
      <span v-else-if="setting.changed.value" class="kvc-connectors-state">
        <span class="kvc-chip" data-test="model-changed">{{ scoped('kvcoder.config.model.changed') }}</span>
        <button type="button" class="kvc-text-button" :disabled="setting.saving.value" data-test="model-reset" @click="setting.reset">{{ scoped('kvcoder.config.model.reset') }}</button>
      </span>
    </span>
  </div>
</template>

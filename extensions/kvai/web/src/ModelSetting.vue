<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import ModelPicker from './ModelPicker.vue';
import { setDefaultModel } from './default-model.ts';
import { failureOf, useKvman } from './kvman.ts';
import { useModelPicker } from './use-model-picker.ts';
import { useProviders } from './use-providers.ts';

// `kvai.defaultModel` in kvai's configuration (plan 07 §7.3, ADR 0015, 7 and 8): the model popover under a button with
// the model's name, saving into the scope the extension's page is set to.
const key = 'kvai.defaultModel';
const kvman = useKvman();
const { rows, defaultModel, failure, reload } = useProviders();
const source = ref('default');
const issue = ref<{ key: string; params: Record<string, string> } | null>(null);
const button = ref<HTMLButtonElement | null>(null);

async function readSource(): Promise<void> {
  source.value = (await kvman.exec('kernel.settings.list', {})).find((setting) => setting.key === key)?.source ?? 'default';
}

async function refresh(): Promise<void> {
  issue.value = null;
  try {
    await Promise.all([reload(), readSource()]);
  } catch (error) {
    issue.value = failureOf(error);
  }
}

const picker = useModelPicker({
  providers: () => rows.value,
  current: () => defaultModel.value?.id ?? null,
  pick: async (modelId) => {
    await setDefaultModel(kvman, modelId, kvman.scope.value);
    await refresh();
  },
});

async function reset(): Promise<void> {
  try {
    await kvman.exec('kernel.settings.reset', { key, scope: kvman.scope.value });
    await refresh();
  } catch (error) {
    issue.value = failureOf(error);
  }
}

onMounted(refresh);
watch(() => [kvman.scope.value, kvman.workspace.value.id], refresh);

const label = computed(() => defaultModel.value?.name ?? defaultModel.value?.id ?? kvman.t('kvai.ui.picker.choose'));
// On "All workspaces", a value the workspace set for itself is the one in effect, and can't be edited from here.
const locked = computed(() => kvman.scope.value === 'global' && source.value === 'workspace');
const changed = computed(() => source.value === kvman.scope.value);
const shownIssue = computed(() => issue.value ?? failure.value);
const scoped = (text: string): string => kvman.t(`${text}.${kvman.scope.value}`, { name: kvman.workspace.value.name });
</script>

<template>
  <div class="kvai-setting" data-test="default-model-setting">
    <span class="kvai-setting-text">
      <span class="kvai-setting-title" data-test="default-title">{{ kvman.t('kvai.defaultModel.title') }}</span>
      <span class="kvai-muted" data-test="default-description">{{ kvman.t('kvai.defaultModel.description') }}</span>
    </span>
    <span class="kvai-setting-control">
      <span class="kvai-picker-anchor">
        <button
          ref="button"
          type="button"
          class="kvai-button kvai-setting-button"
          data-test="default-model-button"
          aria-haspopup="dialog"
          :aria-expanded="picker.open.value ? 'true' : 'false'"
          :aria-label="`${kvman.t('kvai.defaultModel.title')}: ${label}`"
          :disabled="locked"
          @click="picker.togglePicker()"
        >
          <span class="kvai-picker-name">{{ label }}</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
        <ModelPicker v-if="picker.open.value" :state="picker" :anchor="button" />
      </span>
      <span v-if="shownIssue !== null" class="kvai-error" data-test="default-issue" role="alert">{{ kvman.t(shownIssue.key, shownIssue.params) }}</span>
      <span v-if="locked" class="kvai-muted" data-test="default-own-value">{{ kvman.t('kvai.config.ownValue', { name: kvman.workspace.value.name }) }}</span>
      <span v-else-if="changed" class="kvai-setting-state">
        <span class="kvai-badge" data-test="default-changed">{{ scoped('kvai.config.changed') }}</span>
        <button type="button" class="kvai-text-button" data-test="default-reset" @click="reset">{{ scoped('kvai.config.reset') }}</button>
      </span>
    </span>
  </div>
</template>

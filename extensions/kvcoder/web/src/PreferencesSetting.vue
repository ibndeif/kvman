<script setup lang="ts">
import { ref, watch } from 'vue';
import { useKvman } from './kvman.ts';
import SettingFrame from './SettingFrame.vue';
import { useSetting } from './use-setting.ts';

// `kvcoder.preferences` in the Agent card (plan 08 §8.7, ADR 0092, 3): a text area the person edits and saves; the
// agent reads it in every chat.
const kvman = useKvman();
const preferences = useSetting(kvman, 'kvcoder.preferences');
const draft = ref('');
const saved = ref(false);
watch(() => preferences.value.value, (value) => (draft.value = typeof value === 'string' ? value : ''), { immediate: true });

async function save(): Promise<void> {
  saved.value = await preferences.set(draft.value);
}
</script>

<template>
  <SettingFrame v-slot="{ disabled }" setting-key="kvcoder.preferences" name="preferences-setting" :setting="preferences" :saved="saved">
    <textarea v-model="draft" class="kvc-field kvc-preferences" rows="5" dir="auto" :disabled="disabled" :aria-label="kvman.t('kvcoder.preferences.title')" :placeholder="kvman.t('kvcoder.config.preferences.placeholder')" data-test="preferences-text" @input="saved = false" />
    <button type="button" class="kvc-button" :disabled="disabled || draft === (preferences.value.value ?? '')" data-test="preferences-save" @click="save">{{ kvman.t('kvcoder.config.preferences.save') }}</button>
  </SettingFrame>
</template>

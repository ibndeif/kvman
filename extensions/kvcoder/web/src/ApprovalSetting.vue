<script setup lang="ts">
import { nextTick, ref, useTemplateRef } from 'vue';
import ApprovalNote from './ApprovalNote.vue';
import ApprovalRules from './ApprovalRules.vue';
import { useKvman } from './kvman.ts';
import SettingFrame from './SettingFrame.vue';
import { useSetting } from './use-setting.ts';

// `kvcoder.approval` in kvcoder's configuration (plan 08 §8.7, ADR 0077): a choice saves as it changes, except
// `never`, which is saved only once the person confirmed what it means. Until then the stored value is unchanged.
const kvman = useKvman();
const approval = useSetting(kvman, 'kvcoder.approval');
const saved = ref(false);
const confirming = ref(false);
const cancel = useTemplateRef<HTMLButtonElement>('cancel');
const choices = ['auto', 'ask', 'never'] as const;

async function save(value: string): Promise<void> {
  confirming.value = false;
  saved.value = await approval.set(value);
}

async function picked(event: Event): Promise<void> {
  if (!(event.target instanceof HTMLSelectElement)) return;
  if (event.target.value !== 'never') return save(event.target.value);
  confirming.value = true;
  await nextTick();
  cancel.value?.focus();
}
</script>

<template>
  <div data-test="approval">
    <SettingFrame v-slot="{ disabled }" setting-key="kvcoder.approval" name="approval-setting" :setting="approval" :saved="saved">
      <select class="kvc-field" :value="confirming ? 'never' : approval.value.value" :disabled="disabled" :aria-label="kvman.t('kvcoder.approval.title')" data-test="approval-setting-control" @change="picked">
        <option v-for="choice in choices" :key="choice" :value="choice">{{ kvman.t(`kvcoder.approval.options.${choice}`) }}</option>
      </select>
      <div v-if="confirming" class="kvc-confirm" role="alertdialog" :aria-label="kvman.t('kvcoder.config.approval.never.title')" data-test="approval-never-confirm" @keydown.escape="confirming = false">
        <span class="kvc-setting-title">{{ kvman.t('kvcoder.config.approval.never.title') }}</span>
        <span data-test="approval-never-text">{{ kvman.t('kvcoder.config.approval.never.text') }}</span>
        <span class="kvc-connector-actions">
          <button ref="cancel" type="button" class="kvc-button" data-test="approval-never-cancel" @click="confirming = false">{{ kvman.t('kvcoder.ui.cancel') }}</button>
          <button type="button" class="kvc-button kvc-danger" data-test="approval-never-yes" @click="save('never')">{{ kvman.t('kvcoder.config.approval.never.confirm') }}</button>
        </span>
      </div>
    </SettingFrame>
    <ApprovalNote :refresh-key="approval.value.value" />
    <ApprovalRules />
  </div>
</template>

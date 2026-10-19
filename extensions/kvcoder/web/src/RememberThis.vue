<script setup lang="ts">
import { ref } from 'vue';
import { toastProblem, useKvman } from './kvman.ts';

// "Remember this" on a message the person sent (plan 08 §8.7, ADR 0092, 3): once confirmed, its text is added on its own
// line to `kvcoder.preferences`, in the scope whose value is in effect.
const props = defineProps<{ text: string }>();
const kvman = useKvman();
const confirming = ref(false);
const adding = ref(false);

async function add(): Promise<void> {
  adding.value = true;
  try {
    const setting = (await kvman.exec('kernel.settings.list', {})).find((row) => row.key === 'kvcoder.preferences');
    const current = typeof setting?.value === 'string' ? setting.value.trim() : '';
    const scope = setting?.source === 'workspace' ? 'workspace' : 'global';
    await kvman.exec('kernel.settings.set', { key: 'kvcoder.preferences', value: current === '' ? props.text : `${current}\n${props.text}`, scope });
    kvman.toast('kvcoder.ui.remember.added', {}, 'success');
    confirming.value = false;
  } catch (error) {
    toastProblem(kvman, error);
  } finally {
    adding.value = false;
  }
}
</script>

<template>
  <span class="kvc-remember">
    <button v-if="!confirming" type="button" class="kvc-text-button kvc-muted" data-test="remember-this" @click="confirming = true">{{ kvman.t('kvcoder.ui.remember.this') }}</button>
    <span v-else class="kvc-confirm" role="alertdialog" :aria-label="kvman.t('kvcoder.ui.remember.question')" data-test="remember-confirm" @keydown.escape="confirming = false">
      <span>{{ kvman.t('kvcoder.ui.remember.question') }}</span>
      <span class="kvc-muted" dir="auto" style="white-space: pre-wrap">{{ props.text }}</span>
      <span class="kvc-connector-actions">
        <button type="button" class="kvc-button" data-test="remember-cancel" @click="confirming = false">{{ kvman.t('kvcoder.ui.cancel') }}</button>
        <button type="button" class="kvc-button kvc-primary" :disabled="adding" data-test="remember-add" @click="add">{{ kvman.t('kvcoder.ui.remember.add') }}</button>
      </span>
    </span>
  </span>
</template>

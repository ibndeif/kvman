<script setup lang="ts">
import { ref } from 'vue';
import { failureOf, useKvman } from './kvman.ts';

// The API key form: a password input that saves with `kvai.provider.key.set`.
const props = defineProps<{ provider: string; onSaved: () => Promise<void> }>();
const kvman = useKvman();
const key = ref('');
const saving = ref(false);
const failure = ref<string | null>(null);
const failureParams = ref<Record<string, string>>({});

async function save(): Promise<void> {
  if (saving.value || key.value === '') return;
  saving.value = true;
  failure.value = null;
  failureParams.value = {};
  try {
    await kvman.exec('kvai.provider.key.set', { provider: props.provider, key: key.value });
    key.value = '';
    await props.onSaved();
    kvman.refresh();
    kvman.toast('kvai.ui.key.saved', {}, 'success');
  } catch (error) {
    const { key: failureKey, params } = failureOf(error);
    failure.value = failureKey;
    failureParams.value = params;
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="kvai-field">
    <label class="kvai-label" for="kvai-key">{{ kvman.t('kvai.ui.key.title') }}</label>
    <input
      id="kvai-key"
      v-model="key"
      data-test="key-input"
      class="kvai-input"
      type="password"
      autocomplete="off"
    />
    <p class="kvai-text kvai-muted" data-test="key-help">{{ kvman.t('kvai.ui.key.help') }}</p>
    <div class="kvai-actions">
      <button type="button" class="kvai-button kvai-primary" data-test="key-save" :disabled="saving || key === ''" @click="save">
        {{ kvman.t('kvai.ui.key.save') }}
      </button>
    </div>
    <p v-if="failure !== null" class="kvai-error" data-test="key-error" role="alert">{{ kvman.t(failure, failureParams) }}</p>
  </div>
</template>

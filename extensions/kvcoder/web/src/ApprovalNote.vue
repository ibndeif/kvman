<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useKvman } from './kvman.ts';

// The effective approval copy (KVC-22; ADR 0077, 5): the loaded `kvcoder.approval`, never inferred from its default.
// Reloads on the supported scope/workspace refs; loading and failure render honestly.
const kvman = useKvman();
const props = defineProps<{ refreshKey?: unknown }>();
const mode = ref<'ask' | 'auto' | 'never' | undefined>(undefined);
const failed = ref(false);
const checking = ref(true);
let epoch = 0;
let disposed = false;

async function load(): Promise<void> {
  const request = ++epoch;
  const workspace = kvman.workspace.value.id;
  const scope = kvman.scope.value;
  const current = () => !disposed && request === epoch && workspace === kvman.workspace.value.id && scope === kvman.scope.value;
  checking.value = true;
  failed.value = false;
  try {
    const settings = await kvman.exec('kernel.settings.list', {});
    if (!current()) return;
    const value = settings.find((setting) => setting.key === 'kvcoder.approval')?.value;
    if (value !== 'ask' && value !== 'auto' && value !== 'never') throw new Error('Approval mode is not loaded.');
    mode.value = value;
  } catch {
    if (!current()) return;
    mode.value = undefined;
    failed.value = true;
  } finally {
    if (current()) checking.value = false;
  }
}

onMounted(load);
watch(() => [kvman.scope.value, kvman.workspace.value.id, props.refreshKey], load, { flush: 'sync' });
onBeforeUnmount(() => { disposed = true; epoch += 1; });
</script>

<template>
  <div class="kvc-muted kvc-start-note" data-test="approval-note">
    <p v-if="checking" data-test="approval-loading">{{ kvman.t('kvcoder.ui.approvalNote.loading') }}</p>
    <template v-else-if="failed || mode === undefined">
      <p data-test="approval-failed">{{ kvman.t('kvcoder.ui.approvalNote.failed') }}</p>
      <button type="button" class="kvc-text-button" data-test="approval-retry" @click="void load()">{{ kvman.t('kvcoder.ui.tryAgain') }}</button>
    </template>
    <template v-else>
      <p data-test="approval-mode" :data-mode="mode">{{ kvman.t(`kvcoder.ui.approvalNote.${mode}`) }}</p>
      <p data-test="approval-limits">{{ kvman.t('kvcoder.ui.approvalNote.limits') }}</p>
    </template>
  </div>
</template>

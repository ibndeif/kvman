<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useKvman } from './kvman.ts';
import SettingFrame from './SettingFrame.vue';
import { useSetting } from './use-setting.ts';

// The `shell` connector's configuration (plan 08 §8.7, ADR 0020, 2 and 13): when its calls ask, and the shell program.
// Each row saves as it changes, into the scope the extension's page is set to.
const kvman = useKvman();
const approval = useSetting(kvman, 'kvcoder.shell.approval');
const path = useSetting(kvman, 'kvcoder.shell.path');
const saved = ref<'approval' | 'path' | undefined>();
const choices = ['auto', 'ask'] as const;

const storedPath = computed(() => (typeof path.value.value === 'string' ? path.value.value : ''));
const typed = ref('');
watch(storedPath, (value) => (typed.value = value), { immediate: true });

async function saveApproval(event: Event): Promise<void> {
  if (!(event.target instanceof HTMLSelectElement)) return;
  saved.value = (await approval.set(event.target.value)) ? 'approval' : undefined;
}

// An empty field is `null`: the shell is then found (plan 08 §8.3). A failed change shows the stored value again.
async function savePath(): Promise<void> {
  const next = typed.value.trim();
  if (next === storedPath.value) return void (typed.value = next);
  saved.value = (await path.set(next === '' ? null : next)) ? 'path' : undefined;
  typed.value = storedPath.value;
}
</script>

<template>
  <div class="kvc-dialog-rows" data-test="shell-settings">
    <SettingFrame v-slot="{ disabled }" setting-key="kvcoder.shell.approval" name="shell-approval" :setting="approval" :saved="saved === 'approval'">
      <select class="kvc-field" :value="approval.value.value" :disabled="disabled" :aria-label="kvman.t('kvcoder.shell.approval.title')" data-test="shell-approval-control" @change="saveApproval">
        <option v-for="choice in choices" :key="choice" :value="choice">{{ kvman.t(`kvcoder.shell.approval.options.${choice}`) }}</option>
      </select>
    </SettingFrame>
    <SettingFrame v-slot="{ disabled }" setting-key="kvcoder.shell.path" name="shell-path" :setting="path" :saved="saved === 'path'">
      <input v-model="typed" type="text" dir="ltr" class="kvc-field kvc-mono" :disabled="disabled" :placeholder="kvman.t('kvcoder.config.shell.pathFound')" :aria-label="kvman.t('kvcoder.shell.path.title')" spellcheck="false" autocomplete="off" data-test="shell-path-control" @keydown.enter="savePath" @blur="savePath" />
    </SettingFrame>
  </div>
</template>

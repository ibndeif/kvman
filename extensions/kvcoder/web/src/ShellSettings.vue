<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue';
import { useKvman } from './kvman.ts';
import SettingFrame from './SettingFrame.vue';
import { useSetting } from './use-setting.ts';

// The `shell` connector's configuration (plan 08 §8.7, ADR 0020, 2 and 13; ADR 0077, 6): the shell program, saved into
// the scope the extension's page is set to.
const kvman = useKvman();
const path = useSetting(kvman, 'kvcoder.shell.path');
const saved = ref(false);
const field = useTemplateRef<HTMLInputElement>('field');

const storedPath = computed(() => (typeof path.value.value === 'string' ? path.value.value : ''));
const typed = ref('');
watch(storedPath, (value) => (typed.value = value), { immediate: true });

// An empty field is `null`: the shell is then found (plan 08 §8.3). A failed change shows the stored value again.
// The field is disabled while it saves, which takes the focus out of the dialog: a save made from the field gives it back.
async function savePath(): Promise<void> {
  const next = typed.value.trim();
  if (next === storedPath.value) return void (typed.value = next);
  const focused = document.activeElement === field.value;
  saved.value = await path.set(next === '' ? null : next);
  typed.value = storedPath.value;
  if (!focused) return;
  await nextTick();
  field.value?.focus();
}
</script>

<template>
  <div class="kvc-dialog-rows" data-test="shell-settings">
    <SettingFrame v-slot="{ disabled }" setting-key="kvcoder.shell.path" name="shell-path" :setting="path" :saved="saved">
      <input ref="field" v-model="typed" type="text" dir="ltr" class="kvc-field kvc-mono" :disabled="disabled" :placeholder="kvman.t('kvcoder.config.shell.pathFound')" :aria-label="kvman.t('kvcoder.shell.path.title')" spellcheck="false" autocomplete="off" data-test="shell-path-control" @keydown.enter="savePath" @blur="savePath" />
    </SettingFrame>
  </div>
</template>

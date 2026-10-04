<script setup lang="ts">
import type { Problem } from '@kvman/sdk';
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { runCommand } from '../../state/commands.ts';
import { useKvwebui } from '../../state/kvwebui.ts';
import { reloadPreset } from '../../state/preset.ts';
import ErrorCard from '../shared/ErrorCard.vue';

// "Remove" on an extension (plan 06 §6.6, ADR 0010, 5): it asks first, inline, then saves the removal to the preset;
// kvman applies it at the next start.
const props = defineProps<{ name: string }>();
const state = useKvwebui();
const { t } = useI18n();
const confirming = ref(false);
const problem = ref<Problem | undefined>(undefined);

const remove = async (): Promise<void> => {
  confirming.value = false;
  problem.value = undefined;
  await runCommand(state, 'kernel.extensions.uninstall', { name: props.name }, async (outcome) => {
    if (!outcome.ok) {
      problem.value = outcome.problem;
      return;
    }
    await reloadPreset(state);
    state.toasts.show({ text: 'kvwebui.extensions.removed', params: {}, level: 'success' });
  });
};
</script>

<template>
  <div class="flex flex-col gap-2" :data-test="`remove-${props.name}`">
    <div v-if="confirming" class="flex flex-wrap items-center gap-2" role="group" :aria-label="t('kvwebui.extensions.remove.confirm', { name: props.name })">
      <span class="font-medium">{{ t('kvwebui.extensions.remove.confirm', { name: props.name }) }}</span>
      <button type="button" class="h-11 rounded-xl bg-danger px-4 font-medium text-on-primary" data-test="remove-confirm" @click="remove">{{ t('kvwebui.extensions.remove') }}</button>
      <button type="button" class="h-11 rounded-xl border border-line bg-surface px-4 font-medium" data-test="remove-cancel" @click="confirming = false">{{ t('kvwebui.extensions.remove.cancel') }}</button>
    </div>
    <button v-else type="button" class="h-11 self-start rounded-xl border border-line bg-surface px-4 font-medium text-danger" data-test="remove" @click="confirming = true">{{ t('kvwebui.extensions.remove') }}</button>
    <ErrorCard v-if="problem" :problem="problem" title="kvwebui.extensions.removeFailed" :dismiss="() => (problem = undefined)" data-test="remove-error" />
  </div>
</template>

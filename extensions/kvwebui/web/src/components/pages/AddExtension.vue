<script setup lang="ts">
import type { Problem } from '@kvman/sdk';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { runCommand } from '../../state/commands.ts';
import { useKvwebui } from '../../state/kvwebui.ts';
import { reloadPreset } from '../../state/preset.ts';
import ErrorCard from '../shared/ErrorCard.vue';

// "Add an extension" (plan 06 §6.6, ADR 0010, 5): a source, which carries the name, goes to `kernel.extensions.install`, which saves
// them to the preset; kvman installs, loads, and trusts the extension at the next start.
const state = useKvwebui();
const { t } = useI18n();
const source = ref('');
const problem = ref<Problem | undefined>(undefined);
const busy = ref(false);
const ready = computed(() => source.value.trim() !== '' && !busy.value);

const install = async (): Promise<void> => {
  busy.value = true;
  problem.value = undefined;
  await runCommand(state, 'kernel.extensions.install', { source: source.value.trim() }, async (outcome) => {
    if (!outcome.ok) {
      problem.value = outcome.problem;
      return;
    }
    source.value = '';
    await reloadPreset(state);
    state.toasts.show({ text: 'kvwebui.extensions.added', params: {}, level: 'success' });
  });
  busy.value = false;
};
</script>

<template>
  <section class="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4.5" data-test="add-extension">
    <h2 class="m-0 text-base font-semibold">{{ t('kvwebui.extensions.add.title') }}</h2>
    <div class="flex flex-wrap items-end gap-3">
      <label class="flex min-w-48 grow basis-72 flex-col gap-1.5">
        <span class="text-[13px] font-medium text-muted">{{ t('kvwebui.extensions.add.source') }}</span>
        <input v-model="source" type="text" dir="ltr" class="h-11 rounded-xl border border-line bg-surface px-3 font-mono text-ink outline-none" :placeholder="t('kvwebui.extensions.add.sourcePlaceholder')" data-test="add-source" />
      </label>
      <button type="button" class="h-11 rounded-xl bg-primary px-5 font-medium text-on-primary disabled:opacity-50" :disabled="!ready" data-test="add-install" @click="install">{{ t('kvwebui.extensions.add.install') }}</button>
    </div>
    <p class="m-0 text-[13px] text-muted" data-test="add-hint">{{ t('kvwebui.extensions.add.hint') }}</p>
    <p v-if="state.preset.value?.origin === 'bundled'" class="m-0 text-[13px] text-muted" data-test="add-bundled-copy">{{ t('kvwebui.extensions.add.bundledCopy') }}</p>
    <ErrorCard v-if="problem" :problem="problem" title="kvwebui.extensions.addFailed" :dismiss="() => (problem = undefined)" data-test="add-error" />
  </section>
</template>

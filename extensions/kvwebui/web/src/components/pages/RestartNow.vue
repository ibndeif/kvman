<script setup lang="ts">
import type { Problem } from '@kvman/sdk';
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { offlineProblem } from '../../api/offline.ts';
import { runCommand } from '../../state/commands.ts';
import { useKvwebui } from '../../state/kvwebui.ts';
import { uptimeNow, whenRestarted } from '../../state/restart.ts';
import ErrorCard from '../shared/ErrorCard.vue';

// "Restart now" on the Extensions page's banner (plan 06 §6.6, ADR 0024, 9): it asks first, inline, then restarts kvman
// and reloads the page once kvman answers again.
const state = useKvwebui();
const { t } = useI18n();
const phase = ref<'idle' | 'confirming' | 'restarting'>('idle');
const problem = ref<Problem | undefined>(undefined);
const timedOut = ref(false);

const restart = async (): Promise<void> => {
  phase.value = 'restarting';
  problem.value = undefined;
  timedOut.value = false;
  const before = await uptimeNow(state);
  // The stop can close the connection before the answer arrives, which is the restart happening.
  const outcome = await runCommand(state, 'kernel.restart', {}, () => undefined);
  if (!outcome.ok && outcome.problem.code !== offlineProblem.code) {
    problem.value = outcome.problem;
    phase.value = 'idle';
    return;
  }
  if (await whenRestarted(state, before)) state.reload();
  else {
    timedOut.value = true;
    phase.value = 'idle';
  }
};
</script>

<template>
  <div class="flex flex-col gap-2" data-test="restart-now">
    <span v-if="phase === 'restarting'" role="status" class="font-medium" data-test="restart-running">{{ t('kvwebui.extensions.restart.running') }}</span>
    <div v-else-if="phase === 'confirming'" class="flex flex-wrap items-center gap-2" role="group" :aria-label="t('kvwebui.extensions.restart.confirm')">
      <span class="font-medium">{{ t('kvwebui.extensions.restart.confirm') }}</span>
      <button type="button" class="h-11 rounded-xl bg-danger px-4 font-medium text-on-primary" data-test="restart-confirm" @click="restart">{{ t('kvwebui.extensions.restart.go') }}</button>
      <button type="button" class="h-11 rounded-xl border border-line bg-surface px-4 font-medium" data-test="restart-cancel" @click="phase = 'idle'">{{ t('kvwebui.extensions.restart.cancel') }}</button>
    </div>
    <button v-else type="button" class="h-11 self-start rounded-xl border border-line bg-surface px-4 font-medium" data-test="restart-now-button" @click="phase = 'confirming'">{{ t('kvwebui.extensions.restart.now') }}</button>
    <ErrorCard v-if="problem" :problem="problem" title="kvwebui.extensions.restart.failed" :dismiss="() => (problem = undefined)" data-test="restart-error" />
    <ErrorCard v-if="timedOut" title="kvwebui.extensions.restart.timeout" :dismiss="() => (timedOut = false)" data-test="restart-timeout" />
  </div>
</template>

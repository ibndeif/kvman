<script setup lang="ts">
import { ShieldAlert } from '@lucide/vue';
import { ref } from 'vue';
import { toastProblem, useKvman } from './kvman.ts';

// One reply's approvals share a card (ADR 0009, 104): Allow or Deny each command, or Allow all.
export type Approval = { questionId: string; command: string; description: string };
const props = defineProps<{ approvals: Approval[] }>();
const emit = defineEmits<{ answered: [jobId: string | null] }>();
const kvman = useKvman();
const busy = ref(false);

async function answer(items: readonly Approval[], confirmed: boolean): Promise<void> {
  busy.value = true;
  try {
    let jobId: string | null = null;
    for (const item of items) jobId = (await kvman.exec('kvcoder.question.answer', { questionId: item.questionId, answer: { confirmed } })).jobId ?? jobId;
    emit('answered', jobId);
  } catch (error) {
    toastProblem(kvman, error);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="kvc-card kvc-ask" data-test="approvals-card">
    <div class="kvc-card-row" style="font-weight: 600"><ShieldAlert :size="18" aria-hidden="true" />{{ kvman.t('kvcoder.ui.allowCommands', { count: props.approvals.length }) }}</div>
    <div v-for="item in props.approvals" :key="item.questionId" class="kvc-card-row" style="border-block-start: 1px solid var(--kv-color-border)" :data-test="`approval-${item.questionId}`">
      <span style="display: flex; flex-direction: column; flex: 1 1 auto; gap: 2px"><span class="kvc-mono">{{ item.command }}</span><span class="kvc-muted">{{ item.description }}</span></span>
      <button type="button" class="kvc-button" :disabled="busy" data-test="deny" @click="answer([item], false)">{{ kvman.t('kvcoder.ui.deny') }}</button>
      <button type="button" class="kvc-button kvc-primary" :disabled="busy" data-test="allow" @click="answer([item], true)">{{ kvman.t('kvcoder.ui.allow') }}</button>
    </div>
    <div v-if="props.approvals.length > 1" class="kvc-card-row kvc-actions" style="border-block-start: 1px solid var(--kv-color-border)">
      <button type="button" class="kvc-button" :disabled="busy" data-test="deny-all" @click="answer(props.approvals, false)">{{ kvman.t('kvcoder.ui.denyAll') }}</button>
      <button type="button" class="kvc-button kvc-primary" :disabled="busy" data-test="allow-all" @click="answer(props.approvals, true)">{{ kvman.t('kvcoder.ui.allowAll') }}</button>
    </div>
  </section>
</template>

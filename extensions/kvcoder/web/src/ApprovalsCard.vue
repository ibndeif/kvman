<script setup lang="ts">
import { ShieldAlert } from '@lucide/vue';
import { useKvman } from './kvman.ts';
import type { Decision } from './use-answers.ts';

// One reply's approvals share a card (ADR 0009, 104): Allow or Deny each command, or Allow all. Each shows the call's
// title and description, and the command under them (ADR 143). The card only says what was decided (ADR 141).
export type Approval = { questionId: string; title: string; command: string; description: string };
const props = defineProps<{ approvals: Approval[] }>();
const emit = defineEmits<{ decide: [decision: Decision] }>();
const kvman = useKvman();
const decide = (approvals: readonly Approval[], confirmed: boolean): void => emit('decide', { approvals: [...approvals], confirmed });
</script>

<template>
  <section class="kvc-card kvc-ask" data-test="approvals-card">
    <div class="kvc-card-row" style="font-weight: 600"><ShieldAlert :size="18" aria-hidden="true" />{{ kvman.t('kvcoder.ui.allowCommands', { count: props.approvals.length }) }}</div>
    <div v-for="item in props.approvals" :key="item.questionId" class="kvc-card-row" style="border-block-start: 1px solid var(--kv-color-border)" :data-test="`approval-${item.questionId}`">
      <span style="display: flex; flex-direction: column; flex: 1 1 auto; gap: 2px; min-inline-size: 0">
        <span v-if="item.title" style="font-weight: 600" data-test="call-title">{{ item.title }}</span>
        <span class="kvc-muted" data-test="call-description">{{ item.description }}</span>
        <span class="kvc-mono" :class="{ 'kvc-muted': item.title }" data-test="call-command">{{ item.command }}</span>
      </span>
      <button type="button" class="kvc-button" data-test="deny" @click="decide([item], false)">{{ kvman.t('kvcoder.ui.deny') }}</button>
      <button type="button" class="kvc-button kvc-primary" data-test="allow" @click="decide([item], true)">{{ kvman.t('kvcoder.ui.allow') }}</button>
    </div>
    <div v-if="props.approvals.length > 1" class="kvc-card-row kvc-actions" style="border-block-start: 1px solid var(--kv-color-border)">
      <button type="button" class="kvc-button" data-test="deny-all" @click="decide(props.approvals, false)">{{ kvman.t('kvcoder.ui.denyAll') }}</button>
      <button type="button" class="kvc-button kvc-primary" data-test="allow-all" @click="decide(props.approvals, true)">{{ kvman.t('kvcoder.ui.allowAll') }}</button>
    </div>
  </section>
</template>

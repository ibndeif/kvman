<script setup lang="ts">
import { ShieldAlert } from '@lucide/vue';
import CallRequest from './CallRequest.vue';
import CallSummaryLine from './CallSummaryLine.vue';
import { callKind, type CallView } from './call-view.ts';
import { useKvman } from './kvman.ts';
import type { Decision } from './use-answers.ts';

// One reply's approvals share a card (ADR 0009, 104): Allow or Deny each call, or Allow all. Each shows the call as its
// own card would (ADR 0036, 12): its description, what it would do and to what, and its payload by its kind, so the
// person sees the change they allow; a line is whole in its closed line. A background call says so (ADR 149). The
// card only says what was decided (ADR 141).
export type Approval = { questionId: string; view: CallView };
const props = defineProps<{ approvals: Approval[] }>();
const emit = defineEmits<{ decide: [decision: Decision] }>();
const kvman = useKvman();
const decide = (approvals: readonly Approval[], confirmed: boolean): void => emit('decide', { approvals: [...approvals], confirmed });
</script>

<template>
  <section class="kvc-card kvc-ask" data-test="approvals-card">
    <div class="kvc-card-row" style="font-weight: 600"><ShieldAlert :size="18" aria-hidden="true" />{{ kvman.t('kvcoder.ui.allowCommands', { count: props.approvals.length }) }}</div>
    <div v-for="item in props.approvals" :key="item.questionId" class="kvc-approval" :data-test="`approval-${item.questionId}`">
      <div class="kvc-card-row">
        <span class="kvc-lines">
          <span v-if="item.view.description" style="font-weight: 600" data-test="call-description">{{ item.view.description }}</span>
          <CallSummaryLine v-if="item.view.connector !== undefined" :view="item.view" whole />
          <span v-else-if="item.view.line" dir="ltr" style="align-self: flex-start" data-test="call-subject"><span class="kvc-mono" :class="{ 'kvc-muted': item.view.description }">{{ item.view.line }}</span></span>
          <span v-if="item.view.background" class="kvc-chip" style="align-self: flex-start" data-test="call-background">{{ kvman.t('kvcoder.ui.jobs.inBackground') }}</span>
        </span>
        <button type="button" class="kvc-button" data-test="deny" @click="decide([item], false)">{{ kvman.t('kvcoder.ui.deny') }}</button>
        <button type="button" class="kvc-button kvc-primary" data-test="allow" @click="decide([item], true)">{{ kvman.t('kvcoder.ui.allow') }}</button>
      </div>
      <CallRequest v-if="callKind(item.view) !== 'line'" :view="item.view" />
    </div>
    <div v-if="props.approvals.length > 1" class="kvc-card-row kvc-actions" style="border-block-start: 1px solid var(--kv-color-border)">
      <button type="button" class="kvc-button" data-test="deny-all" @click="decide(props.approvals, false)">{{ kvman.t('kvcoder.ui.denyAll') }}</button>
      <button type="button" class="kvc-button kvc-primary" data-test="allow-all" @click="decide(props.approvals, true)">{{ kvman.t('kvcoder.ui.allowAll') }}</button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ShieldAlert } from '@lucide/vue';
import { reactive } from 'vue';
import CallFileActions from './CallFileActions.vue';
import CallRequest from './CallRequest.vue';
import CallSummaryLine from './CallSummaryLine.vue';
import { callKind, type CallView } from './call-view.ts';
import { useKvman } from './kvman.ts';
import type { Decision, Rule } from './use-answers.ts';

// One reply's approvals share a card (ADR 0009, 104): Allow or Deny each call, or Allow all. Each shows the call as its
// own card would (ADR 0036, 12): its description, what it would do and to what, and its payload by its kind, so the
// person sees the change they allow; a line is whole in its closed line. A background call says so (ADR 149). Deny and
// Allow are a row under the call, so a long line never squeezes them (ADR 0062, 1). The card only says what was decided (ADR 141).
// A call a rule could cover offers "Always allow", for a line with its first two words to edit, and "Deny and say why…"
// sends a reason with the denial (ADR 0091, 3 and 4).
export type Approval = { questionId: string; view: CallView };
const props = defineProps<{ approvals: Approval[] }>();
const emit = defineEmits<{ decide: [decision: Decision] }>();
const kvman = useKvman();
const decide = (approvals: readonly Approval[], confirmed: boolean): void => emit('decide', { approvals: [...approvals], confirmed });

const fileChanges = new Set(['write', 'edit', 'undo', 'assemble']);
/** Which kind of rule could cover the call, if any: a line of the shell or a program, or a file change. */
function ruleKind(view: CallView): Rule['kind'] | undefined {
  if (view.line !== undefined && view.command === 'exec') return 'line';
  return view.connector === 'fs' && view.command !== undefined && fileChanges.has(view.command) ? 'files' : undefined;
}
const firstWords = (line: string): string => line.trim().split(/\s+/).slice(0, 2).join(' ');
const prefixes = reactive(new Map<string, string>());
const reasons = reactive(new Map<string, string>());
const prefixOf = (item: Approval): string => prefixes.get(item.questionId) ?? firstWords(item.view.line ?? '');
function always(item: Approval): void {
  const prefix = prefixOf(item).trim();
  if (ruleKind(item.view) === 'line' && prefix === '') return;
  emit('decide', { approvals: [item], confirmed: true, remember: ruleKind(item.view) === 'files' ? { kind: 'files' } : { kind: 'line', prefix } });
}
function denyWithReason(item: Approval): void {
  const reason = (reasons.get(item.questionId) ?? '').trim();
  emit('decide', { approvals: [item], confirmed: false, ...(reason === '' ? {} : { reason }) });
}
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
      </div>
      <CallFileActions :view="item.view" pending />
      <CallRequest v-if="callKind(item.view) !== 'line'" :view="item.view" />
      <div class="kvc-card-row kvc-always" data-test="always">
        <button type="button" class="kvc-link-button" :aria-expanded="reasons.has(item.questionId)" data-test="deny-why" @click="reasons.has(item.questionId) ? reasons.delete(item.questionId) : reasons.set(item.questionId, '')">{{ kvman.t('kvcoder.ui.approval.denyWhy') }}</button>
        <template v-if="ruleKind(item.view) === 'line'">
          <label class="kvc-muted" :for="`always-${item.questionId}`">{{ kvman.t('kvcoder.ui.approval.alwaysLine') }}</label>
          <input :id="`always-${item.questionId}`" :value="prefixOf(item)" class="kvc-field kvc-mono" dir="ltr" data-test="always-prefix" @input="prefixes.set(item.questionId, ($event.target as HTMLInputElement).value)" />
          <button type="button" class="kvc-button" :disabled="prefixOf(item).trim() === ''" data-test="always-allow" @click="always(item)">{{ kvman.t('kvcoder.ui.approval.always') }}</button>
        </template>
        <button v-else-if="ruleKind(item.view) === 'files'" type="button" class="kvc-button" data-test="always-allow" @click="always(item)">{{ kvman.t('kvcoder.ui.approval.alwaysFiles') }}</button>
      </div>
      <div v-if="reasons.has(item.questionId)" class="kvc-card-row kvc-reason" data-test="deny-reason">
        <textarea :value="reasons.get(item.questionId)" class="kvc-field" rows="2" dir="auto" :aria-label="kvman.t('kvcoder.ui.approval.reason')" :placeholder="kvman.t('kvcoder.ui.approval.reason')" data-test="deny-reason-text" @input="reasons.set(item.questionId, ($event.target as HTMLTextAreaElement).value)" />
        <button type="button" class="kvc-button" data-test="deny-reason-send" @click="denyWithReason(item)">{{ kvman.t('kvcoder.ui.deny') }}</button>
      </div>
      <div class="kvc-card-row kvc-actions" data-test="decision-actions">
        <button type="button" class="kvc-button" data-test="deny" @click="decide([item], false)">{{ kvman.t('kvcoder.ui.deny') }}</button>
        <button type="button" class="kvc-button kvc-primary" data-test="allow" @click="decide([item], true)">{{ kvman.t('kvcoder.ui.allow') }}</button>
      </div>
    </div>
    <div v-if="props.approvals.length > 1" class="kvc-card-row kvc-actions" style="border-block-start: 1px solid var(--kv-color-border)">
      <button type="button" class="kvc-button" data-test="deny-all" @click="decide(props.approvals, false)">{{ kvman.t('kvcoder.ui.denyAll') }}</button>
      <button type="button" class="kvc-button kvc-primary" data-test="allow-all" @click="decide(props.approvals, true)">{{ kvman.t('kvcoder.ui.allowAll') }}</button>
    </div>
  </section>
</template>

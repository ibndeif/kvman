<script setup lang="ts">
import { computed } from 'vue';
import { useKvman } from './kvman.ts';
import { useSetting } from './use-setting.ts';

// The person's approval rules under the Approval row (plan 08 §8.7, ADR 0091, 1): each with Remove, which writes the
// list without it in the scope being edited.
type Rule = { kind: 'line'; prefix: string } | { kind: 'files' };

const kvman = useKvman();
const allowed = useSetting(kvman, 'kvcoder.approval.allowed');
const isRule = (value: unknown): value is Rule => typeof value === 'object' && value !== null && 'kind' in value && (value.kind === 'files' || (value.kind === 'line' && 'prefix' in value && typeof value.prefix === 'string'));
const rules = computed(() => (Array.isArray(allowed.value.value) ? allowed.value.value.filter(isRule) : []));
const ruleText = (rule: Rule): string => (rule.kind === 'files' ? kvman.t('kvcoder.config.approval.rules.files') : kvman.t('kvcoder.config.approval.rules.line', { prefix: rule.prefix }));

async function remove(index: number): Promise<void> {
  await allowed.set(rules.value.filter((_rule, position) => position !== index));
}
</script>

<template>
  <div class="kvc-rules" data-test="approval-rules">
    <p v-if="rules.length === 0" class="kvc-muted" data-test="approval-rules-none">{{ kvman.t('kvcoder.config.approval.rules.none') }}</p>
    <div v-for="(rule, index) in rules" :key="rule.kind === 'line' ? `line:${rule.prefix}` : 'files'" class="kvc-rule" data-test="approval-rule">
      <span dir="auto" data-test="approval-rule-text">{{ ruleText(rule) }}</span>
      <button type="button" class="kvc-button" :disabled="allowed.locked.value || allowed.saving.value" data-test="approval-rule-remove" @click="remove(index)">{{ kvman.t('kvcoder.config.approval.rules.remove') }}</button>
    </div>
  </div>
</template>

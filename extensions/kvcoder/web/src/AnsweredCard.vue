<script setup lang="ts">
import { Check, CircleCheck } from '@lucide/vue';
import { computed } from 'vue';
import type { AnsweredQuestion } from './message-parts.ts';
import { useKvman } from './kvman.ts';
import { optionsOf } from './question-options.ts';

// An answered `ask` question (plan 08 §8.7, ADR 0013, 1): the question, then what the person answered. A choice shows
// every option with the chosen ones marked, so the answer reads as the card it was given on.
const props = defineProps<{ answered: AnsweredQuestion }>();
const kvman = useKvman();
const prompt = computed(() => String(props.answered.question['prompt'] ?? ''));
const skipped = computed(() => props.answered.answer['dismissed'] === true);
const selected = computed<unknown[]>(() => (Array.isArray(props.answered.answer['selected']) ? props.answered.answer['selected'] : []));
const options = computed(() => optionsOf(props.answered.question).map((option) => ({ ...option, chosen: selected.value.includes(option.id) })));
const other = computed(() => (typeof props.answered.answer['other'] === 'string' ? props.answered.answer['other'] : ''));
const text = computed(() => (typeof props.answered.answer['text'] === 'string' ? props.answered.answer['text'] : ''));
</script>

<template>
  <section class="kvc-card" data-test="answered-card" :aria-label="prompt">
    <div class="kvc-card-row" style="font-weight: 600"><CircleCheck :size="18" aria-hidden="true" class="kvc-ok" /><span dir="auto" data-test="answered-prompt">{{ prompt }}</span></div>
    <div class="kvc-card-body">
      <span v-if="skipped" class="kvc-muted" data-test="answered-skipped">{{ kvman.t('kvcoder.ui.skipped') }}</span>
      <template v-else-if="props.answered.kind === 'choice'">
        <div v-for="option in options" :key="option.id" class="kvc-answered-option" :data-chosen="option.chosen" :data-test="`answered-option-${option.id}`">
          <Check v-if="option.chosen" :size="16" aria-hidden="true" class="kvc-ok" />
          <span v-else class="kvc-answered-gap" aria-hidden="true" />
          <span style="display: flex; flex-direction: column"><span dir="auto">{{ option.label }}</span><span v-if="option.description" class="kvc-muted" dir="auto">{{ option.description }}</span></span>
          <span v-if="option.chosen" class="kvc-sr">{{ kvman.t('kvcoder.ui.chosen') }}</span>
        </div>
        <div v-if="other !== ''" class="kvc-answered-option" data-chosen="true" data-test="answered-other">
          <Check :size="16" aria-hidden="true" class="kvc-ok" />
          <span style="display: flex; flex-direction: column"><span class="kvc-muted">{{ kvman.t('kvcoder.ui.other') }}</span><span dir="auto" style="white-space: pre-wrap">{{ other }}</span></span>
        </div>
      </template>
      <span v-else-if="props.answered.kind === 'confirm'" class="kvc-chip" style="align-self: flex-start" data-test="answered-confirmed">{{ kvman.t(props.answered.answer['confirmed'] === true ? 'kvcoder.ui.yes' : 'kvcoder.ui.no') }}</span>
      <span v-else dir="auto" style="white-space: pre-wrap" data-test="answered-text">{{ text }}</span>
    </div>
  </section>
</template>

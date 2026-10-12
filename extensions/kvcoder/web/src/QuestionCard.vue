<script setup lang="ts">
import { CircleHelp } from '@lucide/vue';
import { computed } from 'vue';
import type { Json } from '@kvman/sdk';
import type { Answer } from './use-answers.ts';
import { problemText, useKvman } from './kvman.ts';
import { optionsOf } from './question-options.ts';
import { questionDraft, type QuestionOwner } from './question-drafts.ts';

const props = defineProps<{ questionId: string; question: Record<string, unknown>; owner?: QuestionOwner | undefined }>();
const emit = defineEmits<{ answer: [answer: Answer] }>();
const kvman = useKvman();
const kind = computed(() => String(props.question['kind'] ?? 'text'));
const prompt = computed(() => String(props.question['prompt'] ?? ''));
const options = computed(() => optionsOf(props.question));
const multiple = computed(() => props.question['multiple'] === true);
const offersOther = computed(() => props.question['other'] === true);
const draft = computed(() => questionDraft(kvman.workspace.value.id, props.questionId, props.owner));
const errorText = computed(() => problemText(kvman.t, draft.value.error));

// The conversation owns the request; shared state survives card/bridge recreation.
function send(answer: Json): void {
  if (!draft.value.sending && !draft.value.settled) emit('answer', { questionId: props.questionId, answer });
}
function choose(id: string): void {
  if (draft.value.sending) return;
  draft.value.selected = multiple.value ? (draft.value.selected.includes(id) ? draft.value.selected.filter(chosen => chosen !== id) : [...draft.value.selected, id]) : [id];
  if (!multiple.value) draft.value.other = '';
}
function answerChoice(): void {
  const typed = draft.value.other.trim();
  send({ selected: typed !== '' && !multiple.value ? [] : [...draft.value.selected], ...(typed === '' ? {} : { other: typed }) });
}
</script>

<template>
  <section v-if="!draft.settled" class="kvc-card kvc-ask" data-test="question-card" :aria-label="prompt" :aria-busy="draft.sending">
    <div class="kvc-card-row" style="font-weight: 600"><CircleHelp :size="18" aria-hidden="true" /><span dir="auto">{{ prompt }}</span></div>
    <div class="kvc-card-body">
      <p v-if="draft.sending" role="status" data-test="answer-sending">{{ kvman.t('kvcoder.ui.answerSending') }}</p>
      <p v-if="draft.error !== undefined" role="alert" data-test="answer-error">{{ kvman.t('kvcoder.ui.answerFailed', { error: errorText }) }}</p>
      <template v-if="kind === 'text'">
        <input v-model="draft.text" :disabled="draft.sending" class="kvc-field" dir="auto" :placeholder="String(props.question['placeholder'] ?? '')" :aria-label="prompt" data-test="answer-text" @keydown.enter.prevent="send({ text: draft.text })" />
        <div class="kvc-actions">
          <button type="button" :disabled="draft.sending" class="kvc-button" data-test="skip" @click="send({ dismissed: true })">{{ kvman.t('kvcoder.ui.skip') }}</button>
          <button type="button" :disabled="draft.sending" class="kvc-button kvc-primary" data-test="answer" @click="send({ text: draft.text })">{{ kvman.t(draft.error === undefined ? 'kvcoder.ui.answer' : 'kvcoder.ui.tryAgain') }}</button>
        </div>
      </template>
      <template v-else-if="kind === 'choice'">
        <label v-for="option in options" :key="option.id" class="kvc-option" :data-test="`option-${option.id}`">
          <input :type="multiple ? 'checkbox' : 'radio'" :checked="draft.selected.includes(option.id)" :disabled="draft.sending" :name="props.questionId" @change="choose(option.id)" />
          <span style="display: flex; flex-direction: column"><span style="font-weight: 500">{{ option.label }}</span><span v-if="option.description" class="kvc-muted">{{ option.description }}</span></span>
        </label>
        <input v-if="offersOther" v-model="draft.other" :disabled="draft.sending" class="kvc-field" :placeholder="kvman.t('kvcoder.ui.other')" :aria-label="kvman.t('kvcoder.ui.other')" data-test="answer-other" />
        <div class="kvc-actions">
          <button type="button" :disabled="draft.sending" class="kvc-button" data-test="skip" @click="send({ dismissed: true })">{{ kvman.t('kvcoder.ui.skip') }}</button>
          <button type="button" class="kvc-button kvc-primary" :disabled="draft.sending || (draft.selected.length === 0 && draft.other.trim() === '')" data-test="answer" @click="answerChoice">{{ kvman.t(draft.error === undefined ? 'kvcoder.ui.answer' : 'kvcoder.ui.tryAgain') }}</button>
        </div>
      </template>
      <div v-else class="kvc-actions">
        <button type="button" :disabled="draft.sending" class="kvc-button" data-test="answer-no" @click="send({ confirmed: false })">{{ kvman.t('kvcoder.ui.no') }}</button>
        <button type="button" :disabled="draft.sending" class="kvc-button kvc-primary" :class="{ 'kvc-danger': props.question['danger'] === true }" data-test="answer-yes" @click="send({ confirmed: true })">{{ kvman.t('kvcoder.ui.yes') }}</button>
      </div>
    </div>
  </section>
</template>

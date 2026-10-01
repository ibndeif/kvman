<script setup lang="ts">
import { CircleHelp } from '@lucide/vue';
import { computed, ref } from 'vue';
import type { Json } from '@kvman/sdk';
import { fields, toastProblem, useKvman } from './kvman.ts';

// The question card (plan 08 §8.5): an `ask` text, choice, or confirm question, answered or skipped by the person.
type Option = { id: string; label: string; description?: string };
const props = defineProps<{ questionId: string; question: Record<string, unknown> }>();
const emit = defineEmits<{ answered: [jobId: string | null] }>();
const kvman = useKvman();
const kind = computed(() => String(props.question['kind'] ?? 'text'));
const prompt = computed(() => String(props.question['prompt'] ?? ''));
const options = computed<Option[]>(() =>
  (Array.isArray(props.question['options']) ? props.question['options'] : []).map((value: unknown) => {
    const option = fields(value);
    return { id: String(option['id']), label: String(option['label']), ...(typeof option['description'] === 'string' ? { description: option['description'] } : {}) };
  }),
);
const multiple = computed(() => props.question['multiple'] === true);
const offersOther = computed(() => props.question['other'] === true);
const text = ref('');
const selected = ref<string[]>([]);
const other = ref('');
const busy = ref(false);

async function send(answer: Json): Promise<void> {
  busy.value = true;
  try {
    emit('answered', (await kvman.exec('kvcoder.question.answer', { questionId: props.questionId, answer })).jobId);
  } catch (error) {
    toastProblem(kvman, error);
  } finally {
    busy.value = false;
  }
}

function choose(id: string): void {
  selected.value = multiple.value ? (selected.value.includes(id) ? selected.value.filter((chosen) => chosen !== id) : [...selected.value, id]) : [id];
  if (!multiple.value) other.value = '';
}

function answerChoice(): Promise<void> {
  const typed = other.value.trim();
  return send({ selected: typed !== '' && !multiple.value ? [] : selected.value, ...(typed === '' ? {} : { other: typed }) });
}
</script>

<template>
  <section class="kvc-card kvc-ask" data-test="question-card" :aria-label="prompt">
    <div class="kvc-card-row" style="font-weight: 600"><CircleHelp :size="18" aria-hidden="true" />{{ prompt }}</div>
    <div class="kvc-card-body">
      <template v-if="kind === 'text'">
        <input v-model="text" class="kvc-field" :placeholder="String(props.question['placeholder'] ?? '')" :aria-label="prompt" data-test="answer-text" />
        <div class="kvc-actions">
          <button type="button" class="kvc-button" :disabled="busy" data-test="skip" @click="send({ dismissed: true })">{{ kvman.t('kvcoder.ui.skip') }}</button>
          <button type="button" class="kvc-button kvc-primary" :disabled="busy" data-test="answer" @click="send({ text })">{{ kvman.t('kvcoder.ui.answer') }}</button>
        </div>
      </template>
      <template v-else-if="kind === 'choice'">
        <label v-for="option in options" :key="option.id" class="kvc-option" :data-test="`option-${option.id}`">
          <input :type="multiple ? 'checkbox' : 'radio'" :checked="selected.includes(option.id)" :name="props.questionId" @change="choose(option.id)" />
          <span style="display: flex; flex-direction: column"><span style="font-weight: 500">{{ option.label }}</span><span v-if="option.description" class="kvc-muted">{{ option.description }}</span></span>
        </label>
        <input v-if="offersOther" v-model="other" class="kvc-field" :placeholder="kvman.t('kvcoder.ui.other')" :aria-label="kvman.t('kvcoder.ui.other')" data-test="answer-other" />
        <div class="kvc-actions">
          <button type="button" class="kvc-button" :disabled="busy" data-test="skip" @click="send({ dismissed: true })">{{ kvman.t('kvcoder.ui.skip') }}</button>
          <button type="button" class="kvc-button kvc-primary" :disabled="busy || (selected.length === 0 && other.trim() === '')" data-test="answer" @click="answerChoice">{{ kvman.t('kvcoder.ui.answer') }}</button>
        </div>
      </template>
      <div v-else class="kvc-actions">
        <button type="button" class="kvc-button" :disabled="busy" data-test="answer-no" @click="send({ confirmed: false })">{{ kvman.t('kvcoder.ui.no') }}</button>
        <button type="button" class="kvc-button kvc-primary" :class="{ 'kvc-danger': props.question['danger'] === true }" :disabled="busy" data-test="answer-yes" @click="send({ confirmed: true })">{{ kvman.t('kvcoder.ui.yes') }}</button>
      </div>
    </div>
  </section>
</template>

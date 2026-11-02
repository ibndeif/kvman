<script setup lang="ts">
import { Mic } from '@lucide/vue';
import { computed, reactive, ref } from 'vue';
import type { Answer } from './use-answers.ts';
import { fields, problemText, useKvman } from './kvman.ts';
import { questionDraft, type QuestionOwner } from './question-drafts.ts';
import { takeName } from './record-parts.ts';
import RecordLine from './RecordLine.vue';
import type { MicrophoneTrouble, Take } from './use-voice-recorder.ts';

// A pending `ask record` question (plan 08 §8.7; ADR 0115, 24 to 29): the prompt, the tone and pace, then each line to
// record. "Use these takes" uploads the takes (`POST /api/files`) and answers; Skip dismisses. Takes not yet sent live
// only in the page. Where the microphone can't open, the card says so and offers to open the chat in a browser.
const props = defineProps<{ questionId: string; question: Record<string, unknown>; owner?: QuestionOwner | undefined }>();
const emit = defineEmits<{ answer: [answer: Answer] }>();
const kvman = useKvman();
const draft = computed(() => questionDraft(kvman.workspace.value.id, props.questionId, props.owner));
const errorText = computed(() => problemText(kvman.t, draft.value.error));
const prompt = computed(() => String(props.question['prompt'] ?? ''));
const text = (value: unknown): string | undefined => (typeof value === 'string' && value !== '' ? value : undefined);
const words = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []);
const examples = computed(() => (Array.isArray(props.question['exampleFileIds']) ? props.question['exampleFileIds'] : []));
const lines = computed(() =>
  (Array.isArray(props.question['lines']) ? props.question['lines'] : []).map((line: unknown, index) => {
    const given = fields(line);
    const exampleId = text(examples.value[index]);
    return { text: String(given['text'] ?? ''), stress: words(given['stress']), pauses: words(given['pauses']), seconds: typeof given['seconds'] === 'number' ? given['seconds'] : undefined, example: exampleId === undefined ? undefined : `/api/files/${encodeURIComponent(exampleId)}?workspaceId=${encodeURIComponent(kvman.workspace.value.id)}` };
  }),
);
const takes = reactive(new Map<number, Take>());
const trouble = ref<MicrophoneTrouble | undefined>(undefined);
const uploading = ref(false);
const ready = computed(() => lines.value.length > 0 && lines.value.every((_line, index) => takes.has(index)));
const busy = computed(() => draft.value.sending || uploading.value);

function took(index: number, take: Take | undefined): void {
  if (take === undefined) takes.delete(index);
  else takes.set(index, take);
}

function openInBrowser(): void {
  window.open(window.location.href, '_blank', 'noopener');
}

async function upload(index: number, take: Take): Promise<string | undefined> {
  const query = new URLSearchParams({ name: takeName(index + 1, take.type), workspaceId: kvman.workspace.value.id });
  const response = await fetch(`/api/files?${query.toString()}`, { method: 'POST', headers: { 'content-type': take.type }, body: take.blob });
  const answer: unknown = await response.json();
  return typeof answer === 'object' && answer !== null && 'file' in answer && typeof answer.file === 'object' && answer.file !== null && 'id' in answer.file ? String(answer.file.id) : undefined;
}

async function useTakes(): Promise<void> {
  if (!ready.value || busy.value || draft.value.settled) return;
  uploading.value = true;
  try {
    const sent = [];
    for (const [index] of lines.value.entries()) {
      const take = takes.get(index);
      const fileId = take === undefined ? undefined : await upload(index, take);
      if (take === undefined || fileId === undefined) {
        kvman.toast('kvcoder.ui.uploadFailed', { name: takeName(index + 1, take?.type ?? 'audio/webm') }, 'error');
        return;
      }
      sent.push({ fileId, durationMs: take.durationMs });
    }
    emit('answer', { questionId: props.questionId, answer: { takes: sent } });
  } finally {
    uploading.value = false;
  }
}

function skip(): void {
  if (!busy.value && !draft.value.settled) emit('answer', { questionId: props.questionId, answer: { dismissed: true } });
}
</script>

<template>
  <section v-if="!draft.settled" class="kvc-card kvc-ask kvc-record" data-test="record-card" :aria-label="prompt" :aria-busy="busy">
    <div class="kvc-card-row" style="font-weight: 600"><Mic :size="18" aria-hidden="true" /><span dir="auto">{{ prompt }}</span></div>
    <div class="kvc-card-body">
      <p v-if="props.question['tone'] !== undefined || props.question['pace'] !== undefined" class="kvc-muted" dir="auto" data-test="record-how">
        <span v-if="text(props.question['tone'])">{{ kvman.t('kvcoder.ui.record.tone', { tone: String(props.question['tone']) }) }}</span>
        <span v-if="text(props.question['pace'])"> · {{ kvman.t('kvcoder.ui.record.pace', { pace: String(props.question['pace']) }) }}</span>
      </p>
      <div v-if="trouble !== undefined" role="alert" class="kvc-record-trouble" data-test="record-trouble">
        <span>{{ kvman.t(trouble === 'refused' ? 'kvcoder.ui.record.refused' : 'kvcoder.ui.record.unavailable') }}</span>
        <button type="button" class="kvc-text-button" data-test="record-browser" @click="openInBrowser">{{ kvman.t('kvcoder.ui.record.openInBrowser') }}</button>
      </div>
      <ol class="kvc-record-lines">
        <RecordLine v-for="(line, index) in lines" :key="index" :number="index + 1" v-bind="line" :disabled="busy" @take="(take) => took(index, take)" @trouble="(found) => (trouble = found)" />
      </ol>
      <p v-if="draft.sending" role="status" data-test="answer-sending">{{ kvman.t('kvcoder.ui.answerSending') }}</p>
      <p v-if="draft.error !== undefined" role="alert" data-test="answer-error">{{ kvman.t('kvcoder.ui.answerFailed', { error: errorText }) }}</p>
      <div class="kvc-actions">
        <button type="button" :disabled="busy" class="kvc-button" data-test="skip" @click="skip">{{ kvman.t('kvcoder.ui.skip') }}</button>
        <button type="button" :disabled="!ready || busy" class="kvc-button kvc-primary" data-test="record-use" @click="useTakes">{{ kvman.t('kvcoder.ui.record.use') }}</button>
      </div>
    </div>
  </section>
</template>

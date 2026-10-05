<script setup lang="ts">
import { computed } from 'vue';
import type { Turn } from '../../src/index.ts';
import ApprovalsCard, { type Approval } from './ApprovalsCard.vue';
import { callView, shortLine } from './call-view.ts';
import { fields } from './kvman.ts';
import QuestionCard from './QuestionCard.vue';
import type { Answer, Decision } from './use-answers.ts';

// A waiting turn's questions, and its approvals grouped in one card (plan 08 §8.5, ADR 0009, 104). Items the person has
// answered stay out while the answer is on its way (ADR 0009, 141).
const props = defineProps<{ pending: Turn['pending']; hidden?: ReadonlySet<string> | undefined }>();
const emit = defineEmits<{ answer: [answer: Answer]; decide: [decision: Decision] }>();
const open = (item: Turn['pending'][number]): boolean => item.questionId !== null && props.hidden?.has(String(item.questionId)) !== true;
const questions = computed(() => props.pending.filter((item) => item.kind === 'question' && open(item)).map((item) => ({ questionId: String(item.questionId), question: fields(item.question) })));
// What an approval is about: the line a call would run, or the file a change is to, or else its payload on one line.
function subjectOf(question: Record<string, unknown>): string | undefined {
  const view = callView(question);
  const payload = fields(question['payload']);
  if (view.line !== undefined) return view.line;
  if (typeof payload['path'] === 'string') return payload['path'];
  return view.payload === undefined ? undefined : shortLine(view.payload);
}
const approvals = computed<Approval[]>(() =>
  props.pending.filter((item) => item.kind === 'approval' && open(item)).map((item) => {
    const question = fields(item.question);
    const view = callView(question);
    const subject = subjectOf(question);
    return { questionId: String(item.questionId), ...(view.description === undefined ? {} : { description: view.description }), ...(view.label === undefined ? {} : { label: view.label }), ...(subject === undefined ? {} : { subject }), ...(view.background === true ? { background: true } : {}) };
  }),
);
</script>

<template>
  <QuestionCard v-for="item in questions" :key="item.questionId" :question-id="item.questionId" :question="item.question" @answer="(answer) => emit('answer', answer)" />
  <ApprovalsCard v-if="approvals.length > 0" :approvals="approvals" @decide="(decision) => emit('decide', decision)" />
</template>

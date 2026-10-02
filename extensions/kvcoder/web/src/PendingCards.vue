<script setup lang="ts">
import { computed } from 'vue';
import type { Turn } from '../../src/index.ts';
import ApprovalsCard, { type Approval } from './ApprovalsCard.vue';
import { callTitle } from './call-title.ts';
import { fields } from './kvman.ts';
import QuestionCard from './QuestionCard.vue';
import type { Answer, Decision } from './use-answers.ts';

// A waiting turn's questions, and its approvals grouped in one card (plan 08 §8.5, ADR 0009, 104). Items the person has
// answered stay out while the answer is on its way (ADR 0009, 141).
const props = defineProps<{ pending: Turn['pending']; hidden?: ReadonlySet<string> | undefined }>();
const emit = defineEmits<{ answer: [answer: Answer]; decide: [decision: Decision] }>();
const open = (item: Turn['pending'][number]): boolean => item.questionId !== null && props.hidden?.has(String(item.questionId)) !== true;
const questions = computed(() => props.pending.filter((item) => item.kind === 'question' && open(item)).map((item) => ({ questionId: String(item.questionId), question: fields(item.question) })));
const approvals = computed<Approval[]>(() =>
  props.pending.filter((item) => item.kind === 'approval' && open(item)).map((item) => {
    const question = fields(item.question);
    const given = (name: string): string | undefined => (typeof question[name] === 'string' && question[name] !== '' ? String(question[name]) : undefined);
    const title = callTitle(given('title'), given('description'));
    const description = given('description');
    return { questionId: String(item.questionId), command: String(question['command'] ?? ''), mode: question['mode'] === 'async' ? 'async' : 'sync', ...(title === undefined ? {} : { title }), ...(description === undefined ? {} : { description }) };
  }),
);
</script>

<template>
  <QuestionCard v-for="item in questions" :key="item.questionId" :question-id="item.questionId" :question="item.question" @answer="(answer) => emit('answer', answer)" />
  <ApprovalsCard v-if="approvals.length > 0" :approvals="approvals" @decide="(decision) => emit('decide', decision)" />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Turn } from '../../src/index.ts';
import ApprovalsCard, { type Approval } from './ApprovalsCard.vue';
import { fields } from './kvman.ts';
import QuestionCard from './QuestionCard.vue';

// A waiting turn's questions, and its approvals grouped in one card (plan 08 §8.5, ADR 0009, 104).
const props = defineProps<{ pending: Turn['pending'] }>();
const emit = defineEmits<{ answered: [jobId: string | null] }>();
const questions = computed(() => props.pending.filter((item) => item.kind === 'question' && item.questionId !== null).map((item) => ({ questionId: String(item.questionId), question: fields(item.question) })));
const approvals = computed<Approval[]>(() =>
  props.pending.filter((item) => item.kind === 'approval' && item.questionId !== null).map((item) => ({ questionId: String(item.questionId), command: String(fields(item.question)['command'] ?? ''), description: String(fields(item.question)['description'] ?? '') })),
);
</script>

<template>
  <QuestionCard v-for="item in questions" :key="item.questionId" :question-id="item.questionId" :question="item.question" @answered="(jobId) => emit('answered', jobId)" />
  <ApprovalsCard v-if="approvals.length > 0" :approvals="approvals" @answered="(jobId) => emit('answered', jobId)" />
</template>

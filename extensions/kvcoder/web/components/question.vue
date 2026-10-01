<script setup lang="ts">
import '../styles/kvcoder.css';
import QuestionCard from '../src/QuestionCard.vue';

// `kvcoder.question { questionId, question }` (plan 08 §8.5): one question card.
const props = defineProps<{ questionId: string; question: Record<string, unknown> }>();
</script>

<template>
  <QuestionCard :question-id="props.questionId" :question="props.question" />
</template>

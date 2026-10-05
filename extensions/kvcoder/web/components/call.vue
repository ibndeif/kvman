<script setup lang="ts">
import '../styles/kvcoder.css';
import CallCard from '../src/CallCard.vue';

// `kvcoder.call { description?, label?, line?, payload?, failed?, durationMs?, output? }` (plan 08 §8.7).
const props = defineProps<{ description?: string; label?: string; line?: string; payload?: string; failed?: boolean; durationMs?: number; output?: string }>();
</script>

<template>
  <CallCard :description="props.description" :label="props.label" :line="props.line" :payload="props.payload" :failed="props.failed" :duration-ms="props.durationMs" :output="props.output" />
</template>

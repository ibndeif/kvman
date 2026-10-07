<script setup lang="ts">
import { computed } from 'vue';
import '../styles/kvcoder.css';
import CallCard from '../src/CallCard.vue';
import { callView, type CallView } from '../src/call-view.ts';

// `kvcoder.call { description?, connector?, command?, payload?, line?, failed?, durationMs?, output? }` (plan 08 §8.7,
// ADR 0036, 13): a call as the `run` tool takes it, or a command line alone.
const props = defineProps<{ description?: string; connector?: string; command?: string; payload?: Record<string, unknown>; line?: string; failed?: boolean; durationMs?: number; output?: string }>();
const view = computed<CallView>(() =>
  props.connector === undefined
    ? { ...(props.description === undefined ? {} : { description: props.description }), ...(props.line === undefined ? {} : { line: props.line }) }
    : callView({ description: props.description, connector: props.connector, command: props.command, payload: props.payload ?? {} }),
);
</script>

<template>
  <CallCard :view="view" :failed="props.failed" :duration-ms="props.durationMs" :output="props.output" />
</template>

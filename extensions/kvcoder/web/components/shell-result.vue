<script setup lang="ts">
import '../styles/kvcoder.css';
import ShellResult from '../src/ShellResult.vue';

// `kvcoder.shell-result { command, exitCode?, durationMs?, output? }` (plan 08 §8.7).
const props = defineProps<{ command: string; exitCode?: number; durationMs?: number; output?: string }>();
</script>

<template>
  <ShellResult :command="props.command" :exit-code="props.exitCode" :duration-ms="props.durationMs" :output="props.output" />
</template>

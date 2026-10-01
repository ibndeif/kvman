<script setup lang="ts">
import '../styles/kvcoder.css';
import SessionList from '../src/SessionList.vue';

// `kvcoder.sessions { sessionId? }` (ADR 0009, 104).
const props = defineProps<{ sessionId?: string }>();
</script>

<template>
  <SessionList :session-id="props.sessionId" />
</template>

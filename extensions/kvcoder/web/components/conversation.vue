<script setup lang="ts">
import '../styles/kvcoder.css';
import ConversationView from '../src/ConversationView.vue';

// `kvcoder.conversation { sessionId? }` (plan 08 §8.7).
const props = defineProps<{ sessionId?: string }>();
</script>

<template>
  <ConversationView :session-id="props.sessionId" />
</template>

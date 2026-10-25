<script setup lang="ts">
import { computed } from 'vue';

// A step's headline in the conversation (plan 08 §8.7, ADR 0102, 1): what the agent was doing, from its own thinking,
// as a line the person reads; pressed, it shows the thinking behind it.
const props = defineProps<{ headline: string; thinking: readonly string[] }>();
const shown = computed(() => props.thinking.filter((text) => text.trim() !== '').join('\n\n'));
</script>

<template>
  <details class="kvc-headline" data-test="headline">
    <summary dir="auto" data-test="headline-text">{{ props.headline }}</summary>
    <p v-if="shown !== ''" class="kvc-muted" dir="auto" style="white-space: pre-wrap" data-test="headline-thinking">{{ shown }}</p>
  </details>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { outputParts } from './output-links.ts';

// A text whose local URLs are links that open in a new tab (ADR 0009, 120).
const props = defineProps<{ text: string }>();
const parts = computed(() => outputParts(props.text));
</script>

<template>
  <template v-for="(part, index) in parts" :key="index"><a v-if="part.kind === 'link'" :href="part.href" target="_blank" rel="noopener noreferrer" class="kvc-link">{{ part.href }}</a><template v-else>{{ part.text }}</template></template>
</template>

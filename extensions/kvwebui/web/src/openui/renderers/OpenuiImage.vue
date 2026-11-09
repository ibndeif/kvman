<script setup lang="ts">
import { computed } from 'vue';

// An image in OpenUI (plan 06 §6.1, ADR 0124, 7): a `data:` image draws; anything else, a web address included, is a
// placeholder with its alternative text and its address, and nothing loads from the network.
const props = defineProps<{ src: string; alt: string }>();
const drawn = computed(() => props.src.startsWith('data:image/'));
</script>

<template>
  <img v-if="drawn" :src="props.src" :alt="props.alt" class="block max-w-full rounded-lg object-cover" />
  <span v-else dir="auto" class="kvwebui-openui-image inline-block rounded-lg border border-dashed border-line px-2 py-0.5 text-xs text-muted" data-test="openui-image-placeholder">{{ props.alt }} ({{ props.src }})</span>
</template>

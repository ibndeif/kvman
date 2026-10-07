<script setup lang="ts">
import { useKvman } from './kvman.ts';
import { foldAt } from './shown-lines.ts';

// "Show all N lines" under a block of more than 12 lines or rows (`over`, when a block shows more), and "Show fewer"
// once it shows them all (ADR 0036, 7).
const props = defineProps<{ count: number; open: boolean; over?: number | undefined }>();
const emit = defineEmits<{ toggle: [] }>();
const kvman = useKvman();
</script>

<template>
  <button v-if="props.count > (props.over ?? foldAt)" type="button" class="kvc-text-button kvc-fold" :aria-expanded="props.open" data-test="show-all" @click="emit('toggle')">{{ props.open ? kvman.t('kvcoder.ui.call.showFewer') : kvman.t('kvcoder.ui.call.showAll', { count: props.count }) }}</button>
</template>

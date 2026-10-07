<script setup lang="ts">
import { computed, ref } from 'vue';
import FoldButton from './FoldButton.vue';
import { useKvman } from './kvman.ts';
import LinkedText from './LinkedText.vue';
import { folded } from './shown-lines.ts';

// A line's output, or any output that is plain text, in a dark block (plan 08 §8.7): its first 12 lines until the
// person asks for all (ADR 0036, 7). The block keeps one direction, as a terminal does.
const props = defineProps<{ output: string }>();
const kvman = useKvman();
const open = ref(false);
const lines = computed(() => props.output.split('\n'));
const shown = computed(() => folded(lines.value, open.value).join('\n'));
</script>

<template>
  <div class="kvc-output-block">
    <pre class="kvc-output" dir="auto" :aria-label="kvman.t('kvcoder.ui.output')" data-test="call-output"><LinkedText :text="shown" /></pre>
    <FoldButton :count="lines.length" :open="open" @toggle="open = !open" />
  </div>
</template>

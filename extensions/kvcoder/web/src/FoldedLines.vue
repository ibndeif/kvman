<script setup lang="ts">
import { computed, ref } from 'vue';
import FoldButton from './FoldButton.vue';
import LinkedText from './LinkedText.vue';
import { folded, type ShownLine } from './shown-lines.ts';

// A block of lines (ADR 0036, 7 and 8): each reads in its own direction, after its number or its diff mark, which stay
// at the left as in an editor. More than 12 lines show 12 until the person asks for all.
const props = defineProps<{ lines: ShownLine[] }>();
const open = ref(false);
const shown = computed(() => folded(props.lines, open.value));
const numbered = computed(() => props.lines.some((line) => line.number !== undefined));
const marked = computed(() => props.lines.some((line) => line.kind !== undefined));
const marks = { context: ' ', removed: '−', added: '+' };
</script>

<template>
  <div class="kvc-code-lines">
    <div v-for="(line, index) in shown" :key="index" class="kvc-code-line" :dir="numbered || marked ? 'ltr' : undefined" :data-kind="line.kind" data-test="call-line-row">
      <span v-if="numbered" class="kvc-line-number" data-test="call-line-number">{{ line.number }}</span>
      <span v-if="marked" class="kvc-line-mark" aria-hidden="true">{{ marks[line.kind ?? 'context'] }}</span>
      <span class="kvc-line-text" dir="auto" data-test="call-line-text"><LinkedText :text="line.text" /></span>
    </div>
    <FoldButton :count="props.lines.length" :open="open" @toggle="open = !open" />
  </div>
</template>

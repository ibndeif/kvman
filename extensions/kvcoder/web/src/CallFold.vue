<script setup lang="ts">
import { ChevronDown, ChevronRight } from '@lucide/vue';
import { computed, ref, watch } from 'vue';
import type { Message } from '../../src/index.ts';
import { foldTally, foldWords } from './call-folds.ts';
import type { CallView } from './call-view.ts';
import { durationText } from './durations.ts';
import { useKvman } from './kvman.ts';
import MessageItem from './MessageItem.vue';
import type { FinishedRun } from './use-finished-runs.ts';

// Call cards in a row, folded into one row that says what they did and how long they took (plan 08 §8.7, ADR 0093, 1;
// ADR 0098, 2).
// It starts open when it holds a failure or belongs to the running turn, and opens again when that becomes true.
const props = defineProps<{ messages: Message[]; calls: ReadonlyMap<string, CallView>; finishedRuns?: ReadonlyMap<string, FinishedRun> | undefined; running: boolean }>();
const kvman = useKvman();
const summary = computed(() => foldTally(props.messages, props.calls));
const said = computed(() => foldWords(kvman.t, summary.value.tally));
const startsOpen = computed(() => summary.value.failed || props.running);
const open = ref(startsOpen.value);
watch(startsOpen, (now) => {
  if (now) open.value = true;
});
</script>

<template>
  <div class="kvc-card kvc-fold-group" :class="{ 'kvc-failed': summary.failed }" data-test="call-fold">
    <button type="button" class="kvc-card-row kvc-ghost kvc-button" style="inline-size: 100%; border-radius: 0" :aria-expanded="open" data-test="call-fold-head" @click="open = !open">
      <component :is="open ? ChevronDown : ChevronRight" :size="16" aria-hidden="true" />
      <span class="kvc-oneline kvc-fold-words">
        <span data-test="call-fold-words">{{ said.words }}</span>
        <span v-if="said.failed !== undefined" class="kvc-fold-failed" data-test="call-fold-failed"> · {{ said.failed }}</span>
      </span>
      <span class="kvc-muted" data-test="call-fold-time">{{ durationText(kvman.t, summary.ms) }}</span>
    </button>
    <div v-if="open" class="kvc-fold-body" data-test="call-fold-body">
      <MessageItem v-for="message in props.messages" :key="message.id" :message="message" :calls="props.calls" :finished-runs="props.finishedRuns" />
    </div>
  </div>
</template>

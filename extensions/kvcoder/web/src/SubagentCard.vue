<script setup lang="ts">
import { Bot } from '@lucide/vue';
import { computed } from 'vue';
import type { Child } from './use-conversation.ts';
import { titleText, useKvman } from './kvman.ts';
import PendingCards from './PendingCards.vue';

// A subagent's card (ADR 0009, 104): its task, status, the text it is streaming, and its own questions and approvals.
const props = defineProps<{ child: Child }>();
const emit = defineEmits<{ answered: [jobId: string | null] }>();
const kvman = useKvman();
const status = computed(() => kvman.t(`kvcoder.ui.status.${props.child.session.status}`));
</script>

<template>
  <section class="kvc-card" data-test="subagent-card" :aria-label="titleText(kvman.t, props.child.session.title)">
    <div class="kvc-card-row">
      <Bot :size="18" aria-hidden="true" />
      <span style="flex: 1 1 auto; font-weight: 500">{{ titleText(kvman.t, props.child.session.title) }}</span>
      <span v-if="props.child.session.status === 'running'" class="kvc-spin" />
      <span class="kvc-chip" :class="{ 'kvc-warn': props.child.session.status === 'waiting' }">{{ status }}</span>
    </div>
    <div v-if="props.child.live.text !== '' || (props.child.turn?.pending.length ?? 0) > 0" class="kvc-card-body">
      <p v-if="props.child.live.text !== ''" class="kvc-muted" style="margin: 0; white-space: pre-wrap">{{ props.child.live.text }}</p>
      <PendingCards :pending="props.child.turn?.pending ?? []" @answered="(jobId) => emit('answered', jobId)" />
    </div>
  </section>
</template>

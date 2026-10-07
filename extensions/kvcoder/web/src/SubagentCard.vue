<script setup lang="ts">
import { Bot } from '@lucide/vue';
import { computed } from 'vue';
import type { Child } from './use-conversation.ts';
import { titleText, useKvman } from './kvman.ts';
import PendingCards from './PendingCards.vue';
import type { Answer, Decision } from './use-answers.ts';

// A subagent's card (ADR 0009, 104; ADR 0021, 29; ADR 0037, 2): the title its run was given, its worker, its status,
// the first line of its task, the text it is streaming, and its own questions and approvals.
const props = defineProps<{ child: Child; task?: string | undefined; hidden?: ReadonlySet<string> | undefined }>();
const emit = defineEmits<{ answer: [answer: Answer]; decide: [decision: Decision] }>();
const kvman = useKvman();
const taskLine = computed(() => props.task?.trim().split('\n')[0]);
const status = computed(() => kvman.t(`kvcoder.ui.status.${props.child.session.status}`));
</script>

<template>
  <section class="kvc-card" data-test="subagent-card" :aria-label="titleText(kvman.t, props.child.session.title)">
    <div class="kvc-card-row">
      <Bot :size="18" aria-hidden="true" />
      <span v-if="props.child.session.worker !== undefined" class="kvc-chip kvc-mono" data-test="subagent-worker">{{ props.child.session.worker }}</span>
      <span class="kvc-lines"><span style="font-weight: 600" data-test="subagent-title">{{ titleText(kvman.t, props.child.session.title) }}</span><span v-if="taskLine" class="kvc-muted kvc-oneline" dir="auto" data-test="subagent-task">{{ taskLine }}</span></span>
      <span v-if="props.child.session.status === 'running'" class="kvc-spin" />
      <span class="kvc-chip" :class="{ 'kvc-warn': props.child.session.status === 'waiting' }">{{ status }}</span>
    </div>
    <div v-if="props.child.live.text !== '' || (props.child.turn?.pending.length ?? 0) > 0" class="kvc-card-body">
      <p v-if="props.child.live.text !== ''" class="kvc-muted" style="margin: 0; white-space: pre-wrap">{{ props.child.live.text }}</p>
      <PendingCards :pending="props.child.turn?.pending ?? []" :hidden="props.hidden" @answer="(answer) => emit('answer', answer)" @decide="(decision) => emit('decide', decision)" />
    </div>
  </section>
</template>

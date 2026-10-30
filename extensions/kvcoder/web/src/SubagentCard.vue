<script setup lang="ts">
import { Bot } from '@lucide/vue';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import type { Child } from './use-conversation.ts';
import { durationText } from './durations.ts';
import { titleText, useKvman } from './kvman.ts';
import { headlinesOf } from './message-parts.ts';
import PendingCards from './PendingCards.vue';
import type { Answer, Decision } from './use-answers.ts';

// A subagent's card (ADR 0009, 104; ADR 0021, 29; ADR 0037, 2; ADR 0108, 17): the title its run was given, its worker,
// its status, its goal, and while it runs where it is: its newest thinking headline, its step against its budget,
// its time so far, and its last call; then the text it is streaming, and its own questions and approvals.
const props = defineProps<{ child: Child; task?: string | undefined; hidden?: ReadonlySet<string> | undefined }>();
const emit = defineEmits<{ answer: [answer: Answer]; decide: [decision: Decision] }>();
const kvman = useKvman();
const taskLine = computed(() => props.task?.trim().split('\n')[0]);
const status = computed(() => kvman.t(`kvcoder.ui.status.${props.child.session.status}`));
const running = computed(() => props.child.session.status === 'running');

// The newest headline stays shown while the next step thinks, until that step says one of its own.
const headline = ref<string>();
watch(() => props.child.live.thinking, (thinking) => {
  const said = headlinesOf(thinking).at(-1);
  if (said !== undefined) headline.value = said;
}, { immediate: true });

const now = ref(Date.now());
const ticking = setInterval(() => (now.value = Date.now()), 1000);
onBeforeUnmount(() => clearInterval(ticking));
const elapsed = computed(() => {
  const started = props.child.turn?.startedAt;
  return started === undefined ? undefined : durationText(kvman.t, Math.max(now.value - Date.parse(started), 0));
});
const step = computed(() => {
  const budget = props.child.session.run?.budget;
  const steps = props.child.turn?.steps;
  return budget === undefined || steps === undefined ? undefined : kvman.t('kvcoder.ui.helper.step', { step: steps, budget });
});
const lastCall = computed(() => props.child.live.calls.at(-1)?.label);
</script>

<template>
  <section class="kvc-card" data-test="subagent-card" :aria-label="titleText(kvman.t, props.child.session.title)">
    <div class="kvc-card-row">
      <Bot :size="18" aria-hidden="true" />
      <span v-if="props.child.session.worker !== undefined" class="kvc-chip kvc-mono" data-test="subagent-worker">{{ props.child.session.worker }}</span>
      <span class="kvc-lines"><span style="font-weight: 600" data-test="subagent-title">{{ titleText(kvman.t, props.child.session.title) }}</span><span v-if="taskLine" class="kvc-muted kvc-oneline" dir="auto" data-test="subagent-task">{{ taskLine }}</span></span>
      <span v-if="running" class="kvc-spin" />
      <span class="kvc-chip" :class="{ 'kvc-warn': props.child.session.status === 'waiting' }">{{ status }}</span>
    </div>
    <div v-if="running && (headline !== undefined || step !== undefined)" class="kvc-card-row kvc-muted" data-test="subagent-progress">
      <span v-if="headline !== undefined" class="kvc-oneline" dir="auto" style="font-weight: 600" data-test="subagent-headline">{{ headline }}</span>
      <span v-if="step !== undefined" data-test="subagent-step">{{ step }}</span>
      <span v-if="elapsed !== undefined" data-test="subagent-elapsed">{{ elapsed }}</span>
      <span v-if="lastCall !== undefined" class="kvc-mono kvc-oneline" data-test="subagent-call">{{ lastCall }}</span>
    </div>
    <div v-if="props.child.live.text !== '' || (props.child.turn?.pending.length ?? 0) > 0" class="kvc-card-body">
      <p v-if="props.child.live.text !== ''" class="kvc-muted" style="margin: 0; white-space: pre-wrap">{{ props.child.live.text }}</p>
      <PendingCards :owner="props.child.turn === undefined ? undefined : { sessionId: props.child.session.id, turnId: props.child.turn.id }" :pending="props.child.turn?.pending ?? []" :hidden="props.hidden" @answer="(answer) => emit('answer', answer)" @decide="(decision) => emit('decide', decision)" />
    </div>
  </section>
</template>

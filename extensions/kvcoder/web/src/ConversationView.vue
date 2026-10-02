<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Message } from '../../src/index.ts';
import MessageComposer from './MessageComposer.vue';
import ConversationHeader from './ConversationHeader.vue';
import { toastProblem, totals, useKvman } from './kvman.ts';
import ActivityLine from './ActivityLine.vue';
import { callInfos } from './message-parts.ts';
import MessageItem from './MessageItem.vue';
import PendingCards from './PendingCards.vue';
import PromptTab from './PromptTab.vue';
import SubagentCard from './SubagentCard.vue';
import { useAnswers } from './use-answers.ts';
import { useConversation } from './use-conversation.ts';

// kvcoder's conversation (plan 08 §8.7): without a session it is the Chat page's start, whose first message creates
// the chat; with one, the messages, the running step, the pending questions and subagents, and the send box.
const props = defineProps<{ sessionId?: string | undefined }>();
const kvman = useKvman();
const tab = ref<'chat' | 'prompt'>('chat');
const conversation = useConversation(kvman, () => props.sessionId, (error) => toastProblem(kvman, error));
const { session, messages, omitted, turns, live, children } = conversation;
const calls = computed(() => callInfos(messages.value));
const running = computed(() => session.value?.status === 'running');
const pending = computed(() => (session.value?.status === 'waiting' ? (turns.value[0]?.pending ?? []) : []));

// Each ended turn's totals go under its last answer (plan 08 §8.1).
const turnTotals = computed(() => {
  const last = new Map<string, string>();
  for (const message of messages.value) if (message.kind === 'assistant' && message.turnId !== undefined) last.set(message.turnId, message.id);
  const shown = new Map<string, string>();
  for (const turn of turns.value) {
    const messageId = last.get(turn.id);
    if (messageId !== undefined && turn.outcome !== undefined) shown.set(messageId, totals(kvman.t, turn.usage, turn.durationMs));
  }
  return shown;
});

async function send(message: { text: string; fileIds: string[] }): Promise<void> {
  try {
    const sessionId = props.sessionId ?? (await kvman.exec('kvcoder.session.create', {})).id;
    await kvman.exec('kvcoder.message.send', { sessionId, text: message.text, ...(message.fileIds.length > 0 ? { fileIds: message.fileIds } : {}) });
    if (props.sessionId === undefined) kvman.navigate('kvcoder.session', { sessionId });
    else await conversation.refresh();
  } catch (error) {
    toastProblem(kvman, error);
  }
}

async function stop(): Promise<void> {
  if (props.sessionId === undefined) return;
  try {
    await kvman.exec('kvcoder.turn.cancel', { sessionId: props.sessionId });
    await conversation.refresh();
  } catch (error) {
    toastProblem(kvman, error);
  }
}

// An answered question or approval leaves the conversation at once (ADR 0009, 141, 142).
const answers = useAnswers(kvman, (ran) => conversation.refresh(ran));
const waitingOnYou = computed(() => pending.value.filter((item) => item.questionId === null || !answers.hidden.value.has(String(item.questionId))));

async function exportEarlier(): Promise<void> {
  if (props.sessionId === undefined) return;
  try {
    const { fileId } = await kvman.exec('kvcoder.session.export', { sessionId: props.sessionId });
    window.location.assign(`/api/files/${encodeURIComponent(fileId)}?workspaceId=${encodeURIComponent(kvman.workspace.value.id)}`);
  } catch (error) {
    toastProblem(kvman, error);
  }
}

const key = (message: Message): string => message.id;
</script>

<template>
  <section class="kvc-conversation" data-test="conversation">
    <div v-if="props.sessionId === undefined" class="kvc-start">
      <h1>{{ kvman.t('kvcoder.ui.startHeading', { workspace: kvman.workspace.value.name }) }}</h1>
      <MessageComposer :running="false" :placeholder="kvman.t('kvcoder.ui.startPlaceholder')" @send="send" />
      <p class="kvc-muted" style="text-align: center; margin: 0">{{ kvman.t('kvcoder.ui.startHint') }}</p>
    </div>
    <template v-else-if="session">
      <ConversationHeader :session="session" :tab="tab" :turns="turns.length" @tab="tab = $event" @changed="conversation.refresh()" />
      <div class="kvc-scroll">
        <PromptTab v-if="tab === 'prompt'" :session-id="session.id" />
        <div v-else class="kvc-column">
          <button v-if="omitted > 0" type="button" class="kvc-button" style="align-self: center" data-test="earlier" @click="exportEarlier">{{ kvman.t('kvcoder.ui.earlierMessages', { count: omitted }) }}</button>
          <template v-for="message in messages" :key="key(message)">
            <MessageItem :message="message" :calls="calls" />
            <span v-if="turnTotals.has(message.id)" class="kvc-muted" data-test="turn-totals">{{ turnTotals.get(message.id) }}</span>
          </template>
          <div v-if="live.summarizing" class="kvc-notice" data-test="summarizing">{{ kvman.t('kvcoder.ui.summarizing') }}</div>
          <div v-if="running && (live.text !== '' || live.thinking !== '')" class="kvc-answer" data-test="live-answer">
            <details v-if="live.thinking !== ''" :open="live.text === '' && live.calls.length === 0" data-test="live-thinking"><summary class="kvc-muted">{{ kvman.t('kvcoder.ui.thinkingNow') }}</summary><p class="kvc-muted" style="white-space: pre-wrap">{{ live.thinking }}</p></details>
            <component :is="kvman.View" v-if="live.text !== ''" :view="{ type: 'markdown', text: 'kvcoder.markdown', params: { text: live.text } }" />
          </div>
          <ActivityLine v-if="running" :live="live" />
          <SubagentCard v-for="[id, child] in children" :key="id" :child="child" :hidden="answers.hidden.value" @answer="answers.answer" @decide="answers.decide" />
          <PendingCards :pending="pending" :hidden="answers.hidden.value" @answer="answers.answer" @decide="answers.decide" />
          <p v-if="waitingOnYou.some((item) => item.kind !== 'subagent')" class="kvc-muted" style="text-align: center; margin: 0">{{ kvman.t('kvcoder.ui.messageDismisses') }}</p>
        </div>
      </div>
      <MessageComposer :running="running" :placeholder="kvman.t('kvcoder.ui.placeholder')" @send="send" @stop="stop" />
    </template>
  </section>
</template>

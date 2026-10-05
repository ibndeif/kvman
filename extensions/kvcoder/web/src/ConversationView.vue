<script setup lang="ts">
import { ArrowDown } from '@lucide/vue';
import { computed, ref, useTemplateRef } from 'vue';
import type { Message } from '../../src/index.ts';
import ArtifactPanel from './ArtifactPanel.vue';
import MessageComposer from './MessageComposer.vue';
import ChatStart from './ChatStart.vue';
import CommandProgress from './CommandProgress.vue';
import ConversationHeader from './ConversationHeader.vue';
import { toastProblem, totals, useKvman } from './kvman.ts';
import ActivityLine from './ActivityLine.vue';
import { callViews } from './message-parts.ts';
import MessageItem from './MessageItem.vue';
import PendingCards from './PendingCards.vue';
import RecoveryActions from './RecoveryActions.vue';
import PromptTab from './PromptTab.vue';
import SessionModel from './SessionModel.vue';
import type { SlashName } from './slash-commands.ts';
import SubagentCard from './SubagentCard.vue';
import { useAnswers } from './use-answers.ts';
import { useArtifacts } from './use-artifacts.ts';
import { useConversation } from './use-conversation.ts';
import { useFollowLatest } from './use-follow-latest.ts';
import { useSessionActions } from './use-session-actions.ts';
import { useWorkspaceSession } from './use-workspace-session.ts';

// kvcoder's conversation (plan 08 §8.7): without a session it is the Chat page's start, whose first message creates
// the chat; with one, the messages, the running step, the pending questions and subagents, the artifact panel, and
// the send box.
const props = defineProps<{ sessionId?: string | undefined }>();
const kvman = useKvman();
// After a workspace switch the page's chat isn't this workspace's: nothing is read for it until the page has moved.
const sessionId = useWorkspaceSession(kvman, () => props.sessionId, (error) => toastProblem(kvman, error));
const tab = ref<'chat' | 'prompt'>('chat');
const conversation = useConversation(kvman, () => sessionId.value, (error) => toastProblem(kvman, error));
const { session, messages, omitted, turns, live, children } = conversation;
const artifacts = useArtifacts(kvman, () => sessionId.value, () => session.value?.updatedAt, (error) => toastProblem(kvman, error));
const panelShown = computed(() => artifacts.open.value && artifacts.shown.value !== undefined);
const calls = computed(() => callViews(messages.value));
const recoverableNotices = new Set(['STEP_FAILED', 'REPLY_LOST', 'INTERRUPTED']);
const running = computed(() => session.value?.status === 'running');
// When the running turn started, for the header's time (ADR 0018, 9).
const runningSince = computed(() => (running.value && turns.value[0]?.outcome === undefined ? turns.value[0]?.startedAt : undefined));
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
  if (sessionId.value === undefined) return;
  try {
    await kvman.exec('kvcoder.message.send', { sessionId: sessionId.value, text: message.text, ...(message.fileIds.length > 0 ? { fileIds: message.fileIds } : {}) });
    follow.resume();
    await conversation.refresh();
  } catch (error) {
    toastProblem(kvman, error);
  }
}

async function stop(): Promise<void> {
  if (sessionId.value === undefined) return;
  try {
    await kvman.exec('kvcoder.turn.cancel', { sessionId: sessionId.value });
    await conversation.refresh();
  } catch (error) {
    toastProblem(kvman, error);
  }
}

// An answered question or approval leaves the conversation at once (ADR 0009, 141, 142).
const answers = useAnswers(kvman, (ran) => conversation.refresh(ran));
const waitingOnYou = computed(() => pending.value.filter((item) => item.questionId === null || !answers.hidden.value.has(String(item.questionId))));
const recoverable = computed(() => {
  const last = messages.value.at(-1);
  return session.value?.status === 'idle' && last?.kind === 'notice' && recoverableNotices.has(String(last.content['code']));
});
// A slash command of the send box runs what the chat's menu runs (ADR 0017, 6). One that waits shows its line in the
// chat, so it leaves the prompt, and a summary says how it ended (ADR 0019, 1, 4, and 5).
const actions = useSessionActions(kvman, () => sessionId.value ?? '', () => conversation.refresh());
const list = useTemplateRef<HTMLElement>('list');
const follow = useFollowLatest(list, () => [messages.value, live.text, live.thinking, live.calls.length, live.summarizing, running.value, pending.value, children.size, answers.hidden.value, actions.working.value], () => sessionId.value);

async function exportEarlier(): Promise<void> {
  if (sessionId.value === undefined) return;
  try {
    const { fileId } = await kvman.exec('kvcoder.session.export', { sessionId: sessionId.value });
    window.location.assign(`/api/files/${encodeURIComponent(fileId)}?workspaceId=${encodeURIComponent(kvman.workspace.value.id)}`);
  } catch (error) {
    toastProblem(kvman, error);
  }
}

const summaryFailed = (): boolean => messages.value.at(-1)?.kind === 'notice' && messages.value.at(-1)?.content['code'] === 'SUMMARY_FAILED';

async function summarize(): Promise<void> {
  const summarized = await actions.compact();
  if (summarized === true) kvman.toast('kvcoder.ui.summarized', {}, 'success');
  else if (summarized === false && !summaryFailed()) kvman.toast('kvcoder.ui.nothingToSummarize');
}

function command(name: SlashName | 'delete', argument: string): void {
  if (name === 'new') return kvman.navigate('kvcoder.chat');
  if (name === 'prompt') return void (tab.value = tab.value === 'prompt' ? 'chat' : 'prompt');
  if (name === 'delete') return void actions.remove();
  if (actions.working.value !== undefined) return;
  tab.value = 'chat';
  if (name === 'rename') void actions.rename(argument);
  else if (name === 'compact') void summarize();
  else if (name === 'export') void actions.exportFile();
  else void actions.fork();
}

const key = (message: Message): string => message.id;
</script>

<template>
  <div class="kvc-workspace">
    <ConversationHeader v-if="session && sessionId !== undefined" :session="session" :tab="tab" :turns="turns.length" :running-since="runningSince" :artifacts="artifacts.list.value.length" :artifacts-open="artifacts.open.value" :working="actions.working.value !== undefined" @tab="tab = $event" @action="command" @toggle-artifacts="artifacts.toggle()" />
    <div class="kvc-stage">
    <section class="kvc-conversation" data-test="conversation">
      <ChatStart v-if="props.sessionId === undefined" />
      <template v-else-if="session && sessionId !== undefined">
        <div class="kvc-scrollport">
          <div ref="list" class="kvc-scroll" @scroll="follow.onScroll">
            <PromptTab v-if="tab === 'prompt'" :session-id="session.id" @back="tab = 'chat'" />
            <div v-else class="kvc-column">
              <button v-if="omitted > 0" type="button" class="kvc-button" style="align-self: center" data-test="earlier" @click="exportEarlier">{{ kvman.t('kvcoder.ui.earlierMessages', { count: omitted }) }}</button>
              <template v-for="message in messages" :key="key(message)">
                <MessageItem :message="message" :calls="calls" @open-artifact="artifacts.openArtifact($event)" />
                <span v-if="turnTotals.has(message.id)" class="kvc-muted" data-test="turn-totals">{{ turnTotals.get(message.id) }}</span>
              </template>
              <RecoveryActions v-if="recoverable" :session-id="session.id" @sent="follow.resume(); conversation.refresh()" />
            <div v-if="live.summarizing" class="kvc-notice" data-test="summarizing">{{ kvman.t('kvcoder.ui.summarizing') }}</div>
              <div v-if="running && (live.text !== '' || live.thinking !== '')" class="kvc-answer" data-test="live-answer">
                <details v-if="live.thinking !== ''" :open="live.text === '' && live.calls.length === 0" data-test="live-thinking"><summary class="kvc-muted">{{ kvman.t('kvcoder.ui.thinkingNow') }}</summary><p class="kvc-muted" style="white-space: pre-wrap">{{ live.thinking }}</p></details>
                <component :is="kvman.View" v-if="live.text !== ''" :view="{ type: 'markdown', text: 'kvcoder.markdown', params: { text: live.text } }" />
              </div>
              <ActivityLine v-if="running" :live="live" />
              <CommandProgress v-if="actions.working.value" :working="actions.working.value" />
              <SubagentCard v-for="[id, child] in children" :key="id" :child="child" :hidden="answers.hidden.value" @answer="answers.answer" @decide="answers.decide" />
              <PendingCards :pending="pending" :hidden="answers.hidden.value" @answer="answers.answer" @decide="answers.decide" />
              <p v-if="waitingOnYou.some((item) => item.kind !== 'subagent')" class="kvc-muted" style="text-align: center; margin: 0">{{ kvman.t('kvcoder.ui.messageDismisses') }}</p>
            </div>
          </div>
          <button v-if="follow.away.value" type="button" class="kvc-button kvc-jump" data-test="jump-to-latest" @click="follow.resume"><ArrowDown :size="16" aria-hidden="true" />{{ kvman.t('kvcoder.ui.jumpToLatest') }}</button>
        </div>
        <MessageComposer :running="running" :placeholder="kvman.t('kvcoder.ui.placeholder')" :blocked="actions.working.value !== undefined" commands="run" @send="send" @stop="stop" @command="command">
          <template #controls><SessionModel :session="session" @changed="conversation.refresh()" /></template>
        </MessageComposer>
      </template>
    </section>
    <ArtifactPanel v-if="panelShown" :list="artifacts.list.value" :shown="artifacts.shown.value" :content="artifacts.content.value" @select="artifacts.select($event)" @close="artifacts.close()" />
    </div>
  </div>
</template>

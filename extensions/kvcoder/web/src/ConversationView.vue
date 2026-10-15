<script setup lang="ts">
import { ArrowDown } from '@lucide/vue';
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue';
import type { Json } from '@kvman/sdk';
import type { Message } from '../../src/index.ts';
import ArtifactPanel from './ArtifactPanel.vue';
import MessageComposer from './MessageComposer.vue';
import ChatStart from './ChatStart.vue';
import CommandProgress from './CommandProgress.vue';
import ConversationHeader from './ConversationHeader.vue';
import { problemKey, problemOf, toastProblem, tokensUsed, totals, useKvman } from './kvman.ts';
import ActivityLine from './ActivityLine.vue';
import { messageDraft, sendDraft, type Outgoing } from './message-drafts.ts';
import { callViews } from './message-parts.ts';
import MessageItem from './MessageItem.vue';
import PendingCards from './PendingCards.vue';
import RecoveryActions from './RecoveryActions.vue';
import PromptTab from './PromptTab.vue';
import SessionModel from './SessionModel.vue';
import type { RegisteredSlash, SlashName } from './slash-commands.ts';
import SubagentCard from './SubagentCard.vue';
import WorkerCard from './WorkerCard.vue';
import { useAnswers } from './use-answers.ts';
import { useArtifacts } from './use-artifacts.ts';
import { useConversation } from './use-conversation.ts';
import { useExecutionMap } from './use-execution-map.ts';
import { useFollowLatest } from './use-follow-latest.ts';
import { useFinishedRuns } from './use-finished-runs.ts';
import { useSessionActions } from './use-session-actions.ts';
import { useSlashCommands } from './use-slash-commands.ts';
import { useWorkspaceSession } from './use-workspace-session.ts';

// kvcoder's conversation (plan 08 §8.7): without a session it is the Chat page's start, whose first message creates
// the chat; with one, the messages, the running step, the pending questions and subagents, the artifact panel, and
// the send box.
const props = defineProps<{ sessionId?: string | undefined }>();
const kvman = useKvman();
// After a workspace switch the page's chat isn't this workspace's: nothing is read for it until the page has moved.
const { id: sessionId, failed: readFailed } = useWorkspaceSession(kvman, () => props.sessionId, (error) => toastProblem(kvman, error));
const tab = ref<'chat' | 'prompt'>('chat');
// Whether the person has scrolled up from the latest: the window then drops nothing (ADR 0059).
const reading = ref(false);
const conversation = useConversation(kvman, () => sessionId.value, readFailed, () => reading.value);
const { session, messages, omitted, turns, live, children } = conversation;
const artifacts = useArtifacts(kvman, () => sessionId.value, () => session.value?.updatedAt, readFailed);
const executionMap = useExecutionMap(kvman, () => sessionId.value, () => session.value?.updatedAt, artifacts, readFailed);
const panelShown = computed(() => executionMap.shown.value || (artifacts.open.value && artifacts.shown.value !== undefined));
// An ending with steps left says so (ADR 0064, 11).
const stepsLeft = computed(() => (session.value?.status === 'idle' ? executionMap.counts.value?.left ?? 0 : 0));
const calls = computed(() => callViews(messages.value));
const finishedRuns = useFinishedRuns(kvman, () => sessionId.value, messages, readFailed);
const recoverableNotices = new Set(['STEP_FAILED', 'REPLY_LOST', 'REPLY_INCOMPLETE', 'INTERRUPTED']);
const running = computed(() => session.value?.status === 'running');
// When the running turn started, for the header's time (ADR 0018, 9).
const runningSince = computed(() => (running.value && turns.value[0]?.outcome === undefined ? turns.value[0]?.startedAt : undefined));
const pending = computed(() => (session.value?.status === 'waiting' ? (turns.value[0]?.pending ?? []) : []));

// Each ended turn's totals go under its last message: its last answer, or the cards of its last calls (ADR 0035, 1).
const turnTotals = computed(() => {
  const last = new Map<string, string>();
  for (const message of messages.value) if ((message.kind === 'assistant' || message.kind === 'toolResult') && message.turnId !== undefined) last.set(message.turnId, message.id);
  const shown = new Map<string, { text: string; tokens: string }>();
  for (const turn of turns.value) {
    const messageId = last.get(turn.id);
    if (messageId !== undefined && turn.outcome !== undefined) shown.set(messageId, { text: totals(kvman.t, turn.usage, turn.durationMs), tokens: tokensUsed(kvman.t, turn.usage) });
  }
  return shown;
});

// The draft stays until the send is confirmed; a failure shows above the send box (ADR 0048, 6).
async function send(message: Outgoing): Promise<void> {
  const id = sessionId.value;
  if (id === undefined) return;
  const confirmed = await sendDraft(messageDraft(kvman.workspace.value.id, id), message, async (sendId) => {
    await kvman.exec('kvcoder.message.send', { sessionId: id, text: message.text, ...(message.fileIds.length > 0 ? { fileIds: message.fileIds } : {}), sendId });
  });
  if (!confirmed || sessionId.value !== id) return;
  try {
    follow.resume();
    await conversation.refresh();
  } catch (error) {
    toastProblem(kvman, error);
  }
}

// Stop cancels the displayed turn, so a late press never ends a newer one; its reply belongs to the chat it was
// pressed in (ADR 0049, 1 and 3).
const stoppable = computed(() => session.value?.status === 'running' || session.value?.status === 'waiting');
const stopping = ref<string>();
const stopFailed = ref<{ sessionId: string; error: unknown }>();
async function stop(): Promise<void> {
  const id = sessionId.value;
  const turnId = turns.value[0]?.id;
  if (id === undefined || stopping.value === id) return;
  stopping.value = id;
  stopFailed.value = undefined;
  try {
    await kvman.exec('kvcoder.turn.cancel', { sessionId: id, ...(turnId === undefined ? {} : { turnId }) });
    if (sessionId.value === id) await conversation.refresh();
  } catch (error) {
    if (sessionId.value === id) stopFailed.value = { sessionId: id, error };
  } finally {
    if (stopping.value === id) stopping.value = undefined;
  }
}
// What the turn waits for, and what Stop does to it (ADR 0049, 4).
const backgroundRunning = ref(0);
const waitingHint = computed(() => [
  ...(waitingOnYou.value.some((item) => item.kind !== 'subagent' && item.kind !== 'worker') ? [kvman.t('kvcoder.ui.messageDismisses')] : []),
  kvman.t('kvcoder.ui.stopEnds'),
  ...(backgroundRunning.value > 0 ? [kvman.t('kvcoder.ui.stopKeepsBackground')] : []),
].join(' '));

// Questions remain visible until acceptance; requests and drafts bind to the displayed scope.
const questionOwner = () => session.value === null || turns.value[0] === undefined ? undefined : { sessionId: session.value.id, turnId: turns.value[0].id };
const answers = useAnswers(kvman, (ran) => conversation.refresh(ran), questionOwner);
// What each waiting helper was asked, by its session: the task of the call that started it (ADR 0037, 2).
const tasks = computed(() => new Map(pending.value.flatMap((item) => {
  const task = calls.value.get(item.toolCallId)?.fields?.['task'];
  return typeof item.childSessionId === 'string' && typeof task === 'string' ? [[item.childSessionId, task] as const] : [];
})));
const runs = computed(() => pending.value.flatMap((item) => (item.kind === 'worker' && item.runId !== undefined ? [item.runId] : [])));
const waitingOnYou = computed(() => pending.value.filter((item) => item.questionId === null || !answers.hidden.value.has(String(item.questionId))));
const recoverable = computed(() => {
  const last = messages.value.at(-1);
  return session.value?.status === 'idle' && last?.kind === 'notice' && recoverableNotices.has(String(last.content['code']));
});
// A slash command of the send box runs what the chat's menu runs (ADR 0017, 6). One that waits shows its line in the
// chat, so it leaves the prompt, and a summary says how it ended (ADR 0019, 1, 4, and 5).
const slashCommands = useSlashCommands(kvman);
const actions = useSessionActions(kvman, () => sessionId.value ?? '', () => conversation.refresh());

// The first load of a chat this workspace doesn't have moves the page too (ADR 0082, 5).
watch(() => conversation.loadFailure.value, (failure) => {
  if (problemOf(failure)?.code === 'kvcoder/SESSION_NOT_FOUND') readFailed(failure);
});

// Why the messages couldn't be loaded, in the person's language (ADR 0034, 10).
const loadError = computed(() => {
  const problem = problemOf(conversation.loadFailure.value);
  return problem === undefined ? kvman.t('kvcoder.ui.failed') : kvman.t(problemKey(problem.code), problem.params);
});
const list = useTemplateRef<HTMLElement>('list');
const follow = useFollowLatest(list, () => [messages.value, live.text, live.thinking, live.calls.length, live.summarizing, running.value, pending.value, children.size, answers.hidden.value, actions.working.value], () => sessionId.value);

watch(follow.away, (away) => (reading.value = away));

// The earlier page goes above what the person is reading, which stays where it is.
async function showEarlier(): Promise<void> {
  const element = list.value;
  const fromEnd = element === null ? 0 : element.scrollHeight - element.scrollTop;
  try {
    await conversation.showEarlier();
    await nextTick();
    if (element !== null) element.scrollTop = element.scrollHeight - fromEnd;
  } catch (error) {
    toastProblem(kvman, error);
  }
}

async function jumpToLatest(): Promise<void> {
  try {
    await conversation.showLatest();
  } catch (error) {
    toastProblem(kvman, error);
  }
  follow.resume();
}

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

// The number the toast names: `kvcoder.compactKeep` as it is in effect here (ADR 0020, 1).
async function keptMessages(): Promise<Json> {
  return (await kvman.exec('kernel.settings.list', {})).find((setting) => setting.key === 'kvcoder.compactKeep')?.value ?? null;
}

async function summarize(): Promise<void> {
  const summarized = await actions.compact();
  if (summarized === true) kvman.toast('kvcoder.ui.summarized', {}, 'success');
  else if (summarized === false && !summaryFailed()) kvman.toast('kvcoder.ui.nothingToSummarize', { count: await keptMessages() });
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

// A registered slash command runs its extension's command, then sends its text as the person's message (ADR 0027, 9).
async function registered(entry: RegisteredSlash, argument: string): Promise<void> {
  if (actions.working.value !== undefined) return;
  tab.value = 'chat';
  if (!(await actions.runRegistered(entry, argument)) || entry.message === undefined) return;
  await send({ text: argument === '' ? kvman.t(entry.message) : argument, fileIds: [] });
}

const key = (message: Message): string => message.id;
</script>

<template>
  <div class="kvc-workspace">
    <ConversationHeader v-if="session && sessionId !== undefined" :session="session" :tab="tab" :turns="turns.length" :context="conversation.context.value" :running-since="runningSince" :artifacts="artifacts.list.value.length" :artifacts-open="artifacts.open.value && !executionMap.shown.value" :map="executionMap.counts.value" :map-open="executionMap.shown.value" :working="actions.working.value !== undefined" @tab="tab = $event" @action="command" @toggle-artifacts="executionMap.toggleArtifacts()" @toggle-map="executionMap.toggle()" @background-running="(count) => (backgroundRunning = count)" />
    <div class="kvc-stage">
    <section class="kvc-conversation" data-test="conversation">
      <ChatStart v-if="props.sessionId === undefined" :registered="slashCommands" />
      <template v-else-if="session && sessionId !== undefined">
        <div v-if="conversation.loadFailure.value !== undefined" class="kvc-start" role="alert" data-test="load-failure">
          <p class="kvc-start-note">{{ kvman.t('kvcoder.ui.loadFailed', { error: loadError }) }}</p>
          <div class="kvc-actions" style="justify-content: center">
            <button type="button" class="kvc-button kvc-primary" data-test="load-again" @click="conversation.refresh()">{{ kvman.t('kvcoder.ui.tryAgain') }}</button>
            <button type="button" class="kvc-button" data-test="load-export" @click="actions.exportFile()">{{ kvman.t('kvcoder.ui.export') }}</button>
          </div>
        </div>
        <div v-else class="kvc-scrollport">
          <div ref="list" class="kvc-scroll" @scroll="follow.onScroll">
            <PromptTab v-if="tab === 'prompt'" :session-id="session.id" @back="tab = 'chat'" />
            <div v-else class="kvc-column">
              <div v-if="omitted > 0" class="kvc-actions" style="justify-content: center">
                <button type="button" class="kvc-button" data-test="show-earlier" @click="showEarlier">{{ kvman.t('kvcoder.ui.showEarlier', { count: Math.min(omitted, 200) }) }}</button>
                <button type="button" class="kvc-button" data-test="earlier" @click="exportEarlier">{{ kvman.t('kvcoder.ui.earlierMessages', { count: omitted }) }}</button>
              </div>
              <template v-for="message in messages" :key="key(message)">
                <MessageItem :message="message" :calls="calls" :finished-runs="finishedRuns" @open-artifact="executionMap.selectArtifact($event)" />
                <span v-if="turnTotals.has(message.id)" class="kvc-muted" :title="turnTotals.get(message.id)?.tokens" data-test="turn-totals">{{ turnTotals.get(message.id)?.text }}</span>
              </template>
              <div v-if="stepsLeft > 0" class="kvc-notice" data-test="map-remaining">{{ kvman.t('kvcoder.ui.map.remaining', { count: stepsLeft }) }} <button type="button" class="kvc-link-button" data-test="map-show" @click="executionMap.shown.value = true">{{ kvman.t('kvcoder.ui.map.show') }}</button></div>
              <RecoveryActions v-if="recoverable" :session-id="session.id" @sent="follow.resume(); conversation.refresh()" />
            <div v-if="live.summarizing" class="kvc-notice" data-test="summarizing">{{ kvman.t('kvcoder.ui.summarizing') }}</div>
              <div v-if="running && (live.text !== '' || live.thinking !== '')" class="kvc-answer" data-test="live-answer">
                <details v-if="live.thinking !== ''" :open="live.text === '' && live.calls.length === 0" data-test="live-thinking"><summary class="kvc-muted">{{ kvman.t('kvcoder.ui.thinkingNow') }}</summary><p class="kvc-muted" style="white-space: pre-wrap">{{ live.thinking }}</p></details>
                <component :is="kvman.View" v-if="live.text !== ''" :view="{ type: 'markdown', text: 'kvcoder.markdown', params: { text: live.text } }" />
              </div>
              <ActivityLine v-if="running" :live="live" :turn="turns[0]" />
              <CommandProgress v-if="actions.working.value" :working="actions.working.value" />
              <SubagentCard v-for="[id, child] in children" :key="id" :child="child" :task="tasks.get(id)" :hidden="answers.hidden.value" @answer="answers.answer" @decide="answers.decide" />
              <WorkerCard v-for="run in runs" :key="run" :session-id="session.id" :run-id="run" />
              <PendingCards :owner="questionOwner()" :pending="pending" :hidden="answers.hidden.value" @answer="answers.answer" @decide="answers.decide" />
              <p v-if="pending.length > 0" class="kvc-muted" style="text-align: center; margin: 0" data-test="waiting-hint">{{ waitingHint }}</p>
            </div>
          </div>
          <button v-if="follow.away.value" type="button" class="kvc-button kvc-jump" data-test="jump-to-latest" @click="jumpToLatest"><ArrowDown :size="16" aria-hidden="true" />{{ kvman.t('kvcoder.ui.jumpToLatest') }}</button>
        </div>
        <MessageComposer :session-id="session.id" :stoppable="stoppable" :stopping="stopping === session.id" :stop-error="stopFailed?.sessionId === session.id ? stopFailed.error : undefined" :placeholder="kvman.t('kvcoder.ui.placeholder')" :blocked="actions.working.value !== undefined" commands="run" :registered="slashCommands" @send="send" @stop="stop" @command="command" @registered="registered">
          <template #controls><SessionModel :session="session" @changed="conversation.refresh()" /></template>
        </MessageComposer>
      </template>
    </section>
    <ArtifactPanel v-if="panelShown" :list="artifacts.list.value" :shown="artifacts.shown.value" :content="artifacts.content.value" :map="executionMap.map.value" :map-shown="executionMap.shown.value" @select="executionMap.selectArtifact($event)" @select-map="executionMap.shown.value = true" @close="executionMap.close()" />
    </div>
  </div>
</template>

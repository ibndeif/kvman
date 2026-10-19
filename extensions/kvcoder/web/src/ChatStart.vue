<script setup lang="ts">
import ApprovalLine from './ApprovalLine.vue';
import { problemOf, toastProblem, useKvman } from './kvman.ts';
import { messageDraft, sendDraft, type MessageDraft, type Outgoing } from './message-drafts.ts';
import MessageComposer from './MessageComposer.vue';
import ModelControls from './ModelControls.vue';
import { rememberModel } from './remember-model.ts';
import { workspaceTitle } from './start-settings.ts';
import type { RegisteredSlash } from './slash-commands.ts';
import { useChatModel } from './use-chat-model.ts';

// The Chat page's new chat, with no session yet (plan 08 §8.7, ADR 0009, 104 and 194; ADR 0017, 3): the question, and
// the send box with the model and thinking pickers. Sending creates the chat, applies what the person picked, and sends
// the first message. A `registered` slash command creates the chat, runs in it, sends its message, and opens the chat
// (ADR 0028, 2); kvcoder's own slash commands show greyed. A failed send keeps the chat it created, and the retry
// sends into it (ADR 0048, 7).
const kvman = useKvman();
const props = defineProps<{ registered?: readonly RegisteredSlash[] | undefined }>();
const chat = useChatModel(kvman, (error) => toastProblem(kvman, error));

async function pickModel(modelId: string): Promise<void> {
  chat.pickModel(modelId);
  await rememberModel(kvman, modelId);
}

// What the person picked is applied on every try, so a retry into the draft's chat still sets it.
async function createChat(draft?: MessageDraft): Promise<string> {
  const sessionId = draft?.createdChat ?? (await kvman.exec('kvcoder.session.create', {})).id;
  if (draft !== undefined) draft.createdChat = sessionId;
  const changes = chat.changes();
  if (Object.keys(changes).length > 0) await kvman.exec('kvcoder.session.configure', { sessionId, ...changes });
  return sessionId;
}

async function send(message: Outgoing): Promise<void> {
  const draft = messageDraft(kvman.workspace.value.id);
  let sessionId: string | undefined;
  const confirmed = await sendDraft(draft, message, async (sendId) => {
    sessionId = await createChat(draft);
    await kvman.exec('kvcoder.message.send', { sessionId, text: message.text, ...(message.fileIds.length > 0 ? { fileIds: message.fileIds } : {}), sendId });
  });
  if (confirmed && sessionId !== undefined) kvman.navigate('kvcoder.session', { sessionId });
  else if (problemOf(draft.error)?.code === 'kvcoder/SESSION_NOT_FOUND') draft.createdChat = undefined;
}

async function runRegistered(entry: RegisteredSlash, argument: string): Promise<void> {
  try {
    const sessionId = await createChat();
    await kvman.exec(entry.command, { sessionId, argument });
    if (entry.message !== undefined) await kvman.exec('kvcoder.message.send', { sessionId, text: argument === '' ? kvman.t(entry.message) : argument });
    kvman.navigate('kvcoder.session', { sessionId });
  } catch (error) {
    toastProblem(kvman, error);
  }
}
</script>

<template>
  <div class="kvc-start" data-test="chat-start">
    <h1 v-if="chat.start.value !== undefined" data-test="start-heading">{{ kvman.t(chat.start.value.startHeading, { workspace: workspaceTitle(kvman) }) }}</h1>
    <p v-if="chat.state.value === 'needsKey' && chat.provider.value" class="kvc-muted kvc-start-note" role="status" data-test="key-needed">
      {{ kvman.t('kvcoder.ui.keyNeeded', { provider: chat.provider.value.title }) }}
      <button type="button" class="kvc-link-button" data-test="add-key" @click="kvman.navigate('kvai.provider', { providerId: chat.provider.value.id })">{{ kvman.t('kvcoder.ui.addKey') }}</button>
    </p>
    <p v-else-if="chat.state.value === 'noModel'" class="kvc-muted kvc-start-note" role="status" data-test="choose-model">{{ kvman.t('kvcoder.ui.chooseModelHint') }}</p>
    <p v-else class="kvc-muted kvc-start-note">{{ kvman.t('kvcoder.ui.startHint') }}</p>
    <ApprovalLine v-if="chat.start.value !== undefined && !chat.start.value.approvalHidden" :mode="chat.start.value.approval" />
  </div>
  <MessageComposer :stoppable="false" :placeholder="kvman.t(chat.start.value?.placeholder ?? 'kvcoder.ui.startPlaceholder')" :blocked="chat.state.value !== 'ready'" commands="wait" :registered="props.registered" @send="send" @registered="runRegistered">
    <template #controls>
      <ModelControls :groups="chat.groups.value" :model="chat.current.value" :thinking="chat.thinking.value" :empty="chat.state.value === 'loading' ? '' : kvman.t('kvcoder.ui.chooseModel')" :decides="chat.decides.value" @model="pickModel" @thinking="chat.pickThinking" @decides="chat.pickDecides" />
    </template>
  </MessageComposer>
</template>

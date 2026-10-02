<script setup lang="ts">
import { titleText, toastProblem, useKvman } from './kvman.ts';
import MessageComposer from './MessageComposer.vue';
import ModelControls from './ModelControls.vue';
import { rememberModel } from './remember-model.ts';
import { useChatModel } from './use-chat-model.ts';

// The Chat page's new chat, with no session yet (plan 08 §8.7, ADR 0009, 104 and 194): the header of a chat, with the
// model and thinking pickers at the top, then the question and the send box. Sending creates the chat, applies what the
// person picked, and sends the first message.
const kvman = useKvman();
const chat = useChatModel(kvman, (error) => toastProblem(kvman, error));

async function pickModel(modelId: string): Promise<void> {
  chat.pickModel(modelId);
  await rememberModel(kvman, modelId);
}

async function send(message: { text: string; fileIds: string[] }): Promise<void> {
  try {
    const { id: sessionId } = await kvman.exec('kvcoder.session.create', {});
    const changes = chat.changes();
    if (Object.keys(changes).length > 0) await kvman.exec('kvcoder.session.configure', { sessionId, ...changes });
    await kvman.exec('kvcoder.message.send', { sessionId, text: message.text, ...(message.fileIds.length > 0 ? { fileIds: message.fileIds } : {}) });
    kvman.navigate('kvcoder.session', { sessionId });
  } catch (error) {
    toastProblem(kvman, error);
  }
}
</script>

<template>
  <header class="kvc-header" data-test="start-header">
    <div class="kvc-title"><strong>{{ titleText(kvman.t, '') }}</strong></div>
    <ModelControls :groups="chat.groups.value" :model="chat.current.value" :thinking="chat.thinking.value" :empty="chat.state.value === 'loading' ? '' : kvman.t('kvcoder.ui.chooseModel')" @model="pickModel" @thinking="chat.pickThinking" />
  </header>
  <div class="kvc-start">
    <h1>{{ kvman.t('kvcoder.ui.startHeading', { workspace: kvman.workspace.value.name }) }}</h1>
    <p v-if="chat.state.value === 'needsKey' && chat.provider.value" class="kvc-muted kvc-start-note" role="status" data-test="key-needed">
      {{ kvman.t('kvcoder.ui.keyNeeded', { provider: chat.provider.value.title }) }}
      <button type="button" class="kvc-link-button" data-test="add-key" @click="kvman.navigate('kvai.provider', { providerId: chat.provider.value.id })">{{ kvman.t('kvcoder.ui.addKey') }}</button>
    </p>
    <p v-else-if="chat.state.value === 'noModel'" class="kvc-muted kvc-start-note" role="status" data-test="choose-model">{{ kvman.t('kvcoder.ui.chooseModelHint') }}</p>
    <p v-else class="kvc-muted kvc-start-note">{{ kvman.t('kvcoder.ui.startHint') }}</p>
  </div>
  <MessageComposer :running="false" :placeholder="kvman.t('kvcoder.ui.startPlaceholder')" :blocked="chat.state.value !== 'ready'" @send="send" />
</template>

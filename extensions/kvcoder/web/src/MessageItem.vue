<script setup lang="ts">
import { BellRing, Info, NotebookText, ScrollText } from '@lucide/vue';
import { computed } from 'vue';
import type { Message } from '../../src/index.ts';
import { failureReason, fields, isolateValue, problemKey, stringValues, useKvman } from './kvman.ts';
import { answeredQuestion, artifactOf, isBackground, isKvcoderHint, resultCard, textOf, thinkingOf } from './message-parts.ts';
import AnsweredCard from './AnsweredCard.vue';
import ArtifactCard from './ArtifactCard.vue';
import CallCard from './CallCard.vue';
import type { CallView } from './call-view.ts';

// One stored message (plan 08 §8.7): the person's text and images, an answer in Markdown with its thinking folded, a
// tool result's card (an answered question shows its answer), kvcoder's notices and other extensions' notes translated, a summary, and background results.
const props = defineProps<{ message: Message; calls: ReadonlyMap<string, CallView> }>();
const emit = defineEmits<{ openArtifact: [id: string] }>();
const kvman = useKvman();
const text = computed(() => textOf(props.message.content['content']));
const thinking = computed(() => thinkingOf(props.message));
const card = computed(() => resultCard(props.message, props.calls));
const artifact = computed(() => artifactOf(props.message));
const answered = computed(() => answeredQuestion(props.message, props.calls));
const notice = computed(() => {
  const params = fields(props.message.content['params']);
  const code = typeof params['code'] === 'string' ? params['code'] : undefined;
  const isolatedDetails = Object.fromEntries(Object.entries(stringValues(params['details'])).map(([name, value]) => [name, isolateValue(value)]));
  const error = code === undefined ? {} : { error: kvman.t(problemKey(code), isolatedDetails) };
  const reason = failureReason(params['details']);
  const key = String(props.message.content['code']);
  return kvman.t(`kvcoder.notices.${reason === undefined || key !== 'STEP_FAILED' ? key : 'STEP_FAILED_REASON'}`, { ...params, ...error, ...(reason === undefined ? {} : { reason: isolateValue(reason) }) });
});
const note = computed(() => {
  const params = props.message.content['params'];
  return kvman.t(String(props.message.content['key']), typeof params === 'object' && params !== null && !Array.isArray(params) ? Object.fromEntries(Object.entries(params)) : {});
});
const imageUrl = (fileId: string): string => `/api/files/${encodeURIComponent(fileId)}?workspaceId=${encodeURIComponent(kvman.workspace.value.id)}`;
const markdown = (body: string) => ({ type: 'markdown' as const, text: 'kvcoder.markdown', params: { text: body } });
</script>

<template>
  <div v-if="isBackground(props.message)" class="kvc-card" data-test="background-result">
    <details>
      <summary class="kvc-card-row"><BellRing :size="16" aria-hidden="true" />{{ kvman.t(props.message.source?.kind === 'subagent' ? 'kvcoder.ui.helperFinished' : 'kvcoder.ui.backgroundFinished') }}</summary>
      <pre class="kvc-output">{{ text }}</pre>
    </details>
  </div>
  <div v-else-if="isKvcoderHint(props.message)" class="kvc-card" data-test="kvcoder-hint">
    <details>
      <summary class="kvc-card-row"><Info :size="16" aria-hidden="true" />{{ kvman.t('kvcoder.ui.toModel') }}</summary>
      <div class="kvc-card-body kvc-muted">{{ text }}</div>
    </details>
  </div>
  <div v-else-if="props.message.kind === 'user'" dir="auto" class="kvc-user" :class="{ 'kvc-queued': props.message.queued }" data-test="user-message">
    <span>{{ text }}</span>
    <span v-if="props.message.fileIds" style="display: flex; gap: 6px; margin-block-start: 6px">
      <img v-for="fileId in props.message.fileIds" :key="fileId" :src="imageUrl(fileId)" :alt="kvman.t('kvcoder.ui.attachment')" style="block-size: 48px; border-radius: 6px" />
    </span>
    <span v-if="props.message.queued" class="kvc-muted" style="display: block" data-test="queued">{{ kvman.t('kvcoder.ui.queued') }}</span>
  </div>
  <div v-else-if="props.message.kind === 'assistant' && (thinking !== '' || text !== '')" class="kvc-answer" data-test="assistant-message">
    <details v-if="thinking !== ''" data-test="thinking"><summary class="kvc-muted">{{ kvman.t('kvcoder.ui.thought') }}</summary><p class="kvc-muted" style="white-space: pre-wrap">{{ thinking }}</p></details>
    <component :is="kvman.View" v-if="text !== ''" :view="markdown(text)" />
  </div>
  <ArtifactCard v-else-if="props.message.kind === 'toolResult' && artifact !== undefined" :id="artifact.id" :title="artifact.title" :format="artifact.format" :version="artifact.version" @open="emit('openArtifact', $event)" />
  <AnsweredCard v-else-if="answered !== undefined" :answered="answered" />
  <CallCard v-else-if="props.message.kind === 'toolResult'" :description="card.description" :label="card.label" :line="card.line" :payload="card.payload" :failed="card.failed" :duration-ms="card.durationMs" :written-ms="card.writtenMs" :output="card.output" :background="card.background" />
  <div v-else-if="props.message.kind === 'notice'" class="kvc-notice" data-test="notice">{{ notice }}</div>
  <div v-else-if="props.message.kind === 'note'" class="kvc-card kvc-card-row" role="note" data-test="note"><NotebookText :size="18" aria-hidden="true" />{{ note }}</div>
  <details v-else-if="props.message.kind === 'summary'" class="kvc-card" data-test="summary">
    <summary class="kvc-card-row"><ScrollText :size="16" aria-hidden="true" />{{ kvman.t('kvcoder.ui.summarized') }}</summary>
    <div class="kvc-card-body"><component :is="kvman.View" :view="markdown(String(props.message.content['text'] ?? ''))" /></div>
  </details>
</template>

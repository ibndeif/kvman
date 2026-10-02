<script setup lang="ts">
import { computed } from 'vue';
import ArtifactFrame from './ArtifactFrame.vue';
import { useKvman } from './kvman.ts';
import type { ArtifactContent, ArtifactSummary } from './use-artifacts.ts';

// One artifact beside the conversation (plan 08 §8.7, ADR 0009, 177): a row of titles with several, the version, and
// a Close button; Markdown goes through the sanitized view, HTML only through the isolated frame.
const props = defineProps<{ list: ArtifactSummary[]; shown: string | undefined; content: ArtifactContent | undefined }>();
const emit = defineEmits<{ select: [id: string]; close: [] }>();
const kvman = useKvman();
const summary = computed(() => props.list.find((item) => item.id === props.shown));
// The content of the artifact shown: while another one is being read, the old one's must not stay under the new title.
const current = computed(() => (props.content?.id === props.shown ? props.content : undefined));
const title = computed(() => current.value?.title ?? summary.value?.title ?? '');
const version = computed(() => current.value?.version ?? summary.value?.version ?? 1);
const format = computed(() => current.value?.format ?? summary.value?.format ?? 'markdown');
const body = computed(() => current.value?.content ?? '');
const frameLabel = computed(() => kvman.t('kvcoder.ui.artifacts.frameLabel', { title: title.value }));
const markdownView = computed(() => ({ type: 'markdown' as const, text: 'kvcoder.markdown', params: { text: body.value } }));
</script>

<template>
  <aside class="kvc-artifact-panel" data-test="artifact-panel" :aria-label="kvman.t('kvcoder.ui.artifacts.title')">
    <div class="kvc-artifact-head">
      <div v-if="props.list.length > 1" role="tablist" class="kvc-artifact-tabs">
        <button v-for="item in props.list" :key="item.id" type="button" role="tab" class="kvc-tab" :aria-selected="item.id === props.shown" :data-test="`artifact-tab-${item.id}`" @click="emit('select', item.id)">{{ item.title }}</button>
      </div>
      <span v-else class="kvc-artifact-title kvc-oneline" data-test="artifact-title">{{ title }}</span>
      <span class="kvc-chip" data-test="artifact-format">{{ kvman.t(`kvcoder.ui.artifacts.format.${format}`) }}</span>
      <span class="kvc-muted" data-test="artifact-version">{{ kvman.t('kvcoder.ui.artifacts.version', { version: version }) }}</span>
      <button type="button" class="kvc-button" data-test="artifact-close" :aria-label="kvman.t('kvcoder.ui.artifacts.close')" @click="emit('close')">{{ kvman.t('kvcoder.ui.artifacts.close') }}</button>
    </div>
    <div class="kvc-artifact-body" data-test="artifact-body">
      <component :is="kvman.View" v-if="format === 'markdown' && current !== undefined" :view="markdownView" />
      <ArtifactFrame v-else-if="format === 'html' && current !== undefined" :label="frameLabel" :content="body" />
    </div>
  </aside>
</template>

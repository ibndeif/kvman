<script setup lang="ts">
import { Code, Copy, ExternalLink, Eye, X } from '@lucide/vue';
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue';
import ArtifactFrame from './ArtifactFrame.vue';
import ArtifactUrlFrame from './ArtifactUrlFrame.vue';
import ExecutionMap from './ExecutionMap.vue';
import type { ExecutionMapView } from './map-layout.ts';
import { frameableUrl } from './artifact-url.ts';
import { toastProblem, useKvman } from './kvman.ts';
import type { ArtifactContent, ArtifactSummary } from './use-artifacts.ts';

// One artifact beside the conversation (plan 08 §8.7, ADR 0009, 177, 214; ADR 0017, 4): its title (a row of titles with
// several) over its kind and version, a Preview and Source switch, and icon buttons to open, copy, and close; Markdown goes through the sanitized view, HTML only
// through the isolated frame, and Source shows the text as stored. A chat's execution map is the first tab, before
// its artifacts, and has no source, link, or copy (ADR 0064).
const props = defineProps<{ list: ArtifactSummary[]; shown: string | undefined; content: ArtifactContent | undefined; map?: ExecutionMapView | null | undefined; mapShown?: boolean | undefined }>();
const emit = defineEmits<{ select: [id: string]; selectMap: []; close: [] }>();
const kvman = useKvman();
const summary = computed(() => props.list.find((item) => item.id === props.shown));
// The content of the artifact shown: while another one is being read, the old one's must not stay under the new title.
const current = computed(() => (props.content?.id === props.shown ? props.content : undefined));
const onMap = computed(() => props.mapShown === true && props.map !== undefined && props.map !== null);
const tabbed = computed(() => props.list.length + (props.map ? 1 : 0) > 1);
const title = computed(() => (onMap.value ? kvman.t('kvcoder.ui.map.title') : current.value?.title ?? summary.value?.title ?? ''));
const version = computed(() => current.value?.version ?? summary.value?.version ?? 1);
const format = computed(() => current.value?.format ?? summary.value?.format ?? 'markdown');
const body = computed(() => current.value?.content ?? '');
const frameLabel = computed(() => kvman.t('kvcoder.ui.artifacts.frameLabel', { title: title.value }));
const mode = ref<'preview' | 'source'>('preview');
watch(() => props.shown, () => (mode.value = 'preview'));
// The shown artifact's title stays in view in a row of titles too long to fit (ADR 0036, 15).
const titles = useTemplateRef<HTMLElement>('titles');
watch(() => [props.shown, props.list.length, props.mapShown], async () => {
  await nextTick();
  titles.value?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}, { immediate: true });

async function copy(): Promise<void> {
  try {
    await navigator.clipboard.writeText(body.value);
    kvman.toast('kvcoder.ui.copied', {}, 'success');
  } catch (error) {
    toastProblem(kvman, error);
  }
}
const openable = computed(() => (format.value === 'url' ? frameableUrl(body.value, window.location) : undefined));
const markdownView = computed(() => ({ type: 'markdown' as const, text: 'kvcoder.markdown', params: { text: body.value } }));
</script>

<template>
  <aside class="kvc-artifact-panel" data-test="artifact-panel" :aria-label="kvman.t('kvcoder.ui.artifacts.title')">
    <div class="kvc-artifact-head">
      <div class="kvc-artifact-name">
        <div v-if="tabbed" ref="titles" role="tablist" class="kvc-artifact-tabs">
          <button v-if="props.map" type="button" role="tab" class="kvc-tab" :aria-selected="onMap" data-test="artifact-tab-map" @click="emit('selectMap')">{{ kvman.t('kvcoder.ui.map.title') }}</button>
          <button v-for="item in props.list" :key="item.id" type="button" role="tab" class="kvc-tab" :aria-selected="!onMap && item.id === props.shown" :title="item.title" :data-test="`artifact-tab-${item.id}`" @click="emit('select', item.id)">{{ item.title }}</button>
        </div>
        <span v-else class="kvc-artifact-title kvc-oneline" data-test="artifact-title">{{ title }}</span>
        <span v-if="!onMap" class="kvc-muted" data-test="artifact-meta"><span data-test="artifact-format">{{ kvman.t(`kvcoder.ui.artifacts.format.${format}`) }}</span> · <span data-test="artifact-version">{{ kvman.t('kvcoder.ui.artifacts.version', { version: version }) }}</span></span>
      </div>
      <div class="kvc-artifact-actions">
        <div v-if="!onMap" class="kvc-tabs" role="group" :aria-label="kvman.t('kvcoder.ui.artifacts.view')">
          <button type="button" class="kvc-tab" :aria-pressed="mode === 'preview'" :aria-label="kvman.t('kvcoder.ui.artifacts.preview')" :title="kvman.t('kvcoder.ui.artifacts.preview')" data-test="artifact-view-preview" @click="mode = 'preview'"><Eye :size="16" class="kvc-tab-icon" aria-hidden="true" /><span class="kvc-tab-text">{{ kvman.t('kvcoder.ui.artifacts.preview') }}</span></button>
          <button type="button" class="kvc-tab" :aria-pressed="mode === 'source'" :aria-label="kvman.t('kvcoder.ui.artifacts.source')" :title="kvman.t('kvcoder.ui.artifacts.source')" data-test="artifact-view-source" @click="mode = 'source'"><Code :size="16" class="kvc-tab-icon" aria-hidden="true" /><span class="kvc-tab-text">{{ kvman.t('kvcoder.ui.artifacts.source') }}</span></button>
        </div>
        <a v-if="openable !== undefined && !onMap" :href="openable" target="_blank" rel="noopener noreferrer" class="kvc-button kvc-icon-button" :aria-label="kvman.t('kvcoder.ui.artifacts.openUrl')" :title="kvman.t('kvcoder.ui.artifacts.openUrl')" data-test="artifact-open-url"><ExternalLink :size="16" aria-hidden="true" /></a>
        <button v-if="!onMap" type="button" class="kvc-button kvc-icon-button" :disabled="current === undefined" :aria-label="kvman.t('kvcoder.ui.copy')" :title="kvman.t('kvcoder.ui.copy')" data-test="artifact-copy" @click="copy"><Copy :size="16" aria-hidden="true" /></button>
        <button type="button" class="kvc-button kvc-icon-button" :aria-label="kvman.t('kvcoder.ui.artifacts.close')" :title="kvman.t('kvcoder.ui.artifacts.close')" data-test="artifact-close" @click="emit('close')"><X :size="16" aria-hidden="true" /></button>
      </div>
    </div>
    <div class="kvc-artifact-body" data-test="artifact-body">
      <ExecutionMap v-if="onMap && props.map" :map="props.map" />
      <pre v-else-if="mode === 'source' && current !== undefined" class="kvc-artifact-source" dir="ltr" data-test="artifact-source">{{ body }}</pre>
      <component :is="kvman.View" v-else-if="format === 'markdown' && current !== undefined" :view="markdownView" />
      <ArtifactFrame v-else-if="format === 'html' && current !== undefined" :label="frameLabel" :content="body" />
      <ArtifactUrlFrame v-else-if="format === 'url' && current !== undefined" :label="frameLabel" :content="body" />
    </div>
  </aside>
</template>

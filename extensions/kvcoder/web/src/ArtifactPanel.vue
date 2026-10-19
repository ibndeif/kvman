<script setup lang="ts">
import { Code, Copy, ExternalLink, Eye, X } from '@lucide/vue';
import { computed, ref, watch } from 'vue';
import ArtifactFrame from './ArtifactFrame.vue';
import ArtifactUrlFrame from './ArtifactUrlFrame.vue';
import ChoicePicker from './ChoicePicker.vue';
import ChangesView from './ChangesView.vue';
import ExecutionMap from './ExecutionMap.vue';
import type { ChangeList } from './use-changes.ts';
import type { ExecutionMapView } from './map-layout.ts';
import { panelWidthKey, storedWidth } from './panel-width.ts';
import PanelResizer from './PanelResizer.vue';
import { frameableUrl } from './artifact-url.ts';
import { toastProblem, useKvman } from './kvman.ts';
import type { ArtifactContent, ArtifactSummary } from './use-artifacts.ts';

// One artifact beside the conversation (plan 08 §8.7, ADR 0009, 177, 214; ADR 0017, 4): its title over its kind and
// version, a Preview and Source switch, and icon buttons to open, copy, and close; Markdown goes through the sanitized
// view, HTML only through the isolated frame, and Source shows the text as stored. With more than one thing to show, the
// title is a button that opens the list of them (ADR 0071, 1): the chat's execution map first, which has no source,
// link, or copy (ADR 0064), then its artifacts. The person drags the panel's width, which the browser keeps; one
// outside the limits is shown at the nearest (ADR 0071, 4). The chat's changes are an entry after the map (ADR 0093, 2).
const props = defineProps<{ list: ArtifactSummary[]; shown: string | undefined; content: ArtifactContent | undefined; map?: ExecutionMapView | null | undefined; mapShown?: boolean | undefined; sessionId?: string | undefined; changes?: ChangeList | undefined; changesCount?: number | undefined; changesShown?: boolean | undefined }>();
const emit = defineEmits<{ select: [id: string]; selectMap: []; selectChanges: []; close: []; changed: []; commit: [] }>();
const kvman = useKvman();
const summary = computed(() => props.list.find((item) => item.id === props.shown));
// The content of the artifact shown: while another one is being read, the old one's must not stay under the new title.
const current = computed(() => (props.content?.id === props.shown ? props.content : undefined));
const onChanges = computed(() => props.changesShown === true);
const onMap = computed(() => !onChanges.value && props.mapShown === true && props.map !== undefined && props.map !== null);
// The map and the changes have no kind, version, source, link, or copy of their own.
const onOwn = computed(() => onMap.value || onChanges.value);
const tabbed = computed(() => props.list.length + (props.map ? 1 : 0) + ((props.changesCount ?? 0) > 0 ? 1 : 0) > 1);
const title = computed(() => (onChanges.value ? kvman.t('kvcoder.ui.changes.title') : onMap.value ? kvman.t('kvcoder.ui.map.title') : current.value?.title ?? summary.value?.title ?? ''));
const version = computed(() => current.value?.version ?? summary.value?.version ?? 1);
const format = computed(() => current.value?.format ?? summary.value?.format ?? 'markdown');
const body = computed(() => current.value?.content ?? '');
const frameLabel = computed(() => kvman.t('kvcoder.ui.artifacts.frameLabel', { title: title.value }));
const width = ref(storedWidth(localStorage.getItem(panelWidthKey)));
const widthStyle = computed(() => (width.value === undefined ? undefined : { '--kvc-panel-width': `${width.value}px` }));

function resize(px: number): void {
  width.value = px;
  localStorage.setItem(panelWidthKey, String(px));
}

function resetWidth(): void {
  width.value = undefined;
  localStorage.removeItem(panelWidthKey);
}

const mode = ref<'preview' | 'source'>('preview');
watch(() => props.shown, () => (mode.value = 'preview'));
// An artifact's entry carries a prefix, so one whose id is `map` is never taken for the map.
const artifactPrefix = 'artifact:';
const choices = computed(() => [
  ...(props.map ? [{ id: 'map', label: kvman.t('kvcoder.ui.map.title') }] : []),
  ...((props.changesCount ?? 0) > 0 ? [{ id: 'changes', label: kvman.t('kvcoder.ui.changes.title') }] : []),
  ...props.list.map((item) => ({ id: `${artifactPrefix}${item.id}`, label: item.title })),
]);
const chosen = computed(() => (onChanges.value ? 'changes' : onMap.value ? 'map' : props.shown === undefined ? undefined : `${artifactPrefix}${props.shown}`));

function choose(id: string): void {
  if (id.startsWith(artifactPrefix)) emit('select', id.slice(artifactPrefix.length));
  else if (id === 'changes') emit('selectChanges');
  else emit('selectMap');
}

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
  <aside class="kvc-artifact-panel" data-test="artifact-panel" :aria-label="kvman.t('kvcoder.ui.artifacts.title')" :data-sized="width !== undefined" :style="widthStyle">
    <PanelResizer @resize="resize" @reset="resetWidth" />
    <div class="kvc-artifact-head">
      <div class="kvc-artifact-name">
        <ChoicePicker v-if="tabbed" test="artifact-picker" :label="kvman.t('kvcoder.ui.artifacts.choose')" :current="chosen" :options="choices" @pick="choose" />
        <span v-else class="kvc-artifact-title kvc-oneline" data-test="artifact-title">{{ title }}</span>
        <span v-if="!onOwn" class="kvc-muted" data-test="artifact-meta"><span data-test="artifact-format">{{ kvman.t(`kvcoder.ui.artifacts.format.${format}`) }}</span> · <span data-test="artifact-version">{{ kvman.t('kvcoder.ui.artifacts.version', { version: version }) }}</span></span>
      </div>
      <div class="kvc-artifact-actions">
        <div v-if="!onOwn" class="kvc-tabs" role="group" :aria-label="kvman.t('kvcoder.ui.artifacts.view')">
          <button type="button" class="kvc-tab" :aria-pressed="mode === 'preview'" :aria-label="kvman.t('kvcoder.ui.artifacts.preview')" :title="kvman.t('kvcoder.ui.artifacts.preview')" data-test="artifact-view-preview" @click="mode = 'preview'"><Eye :size="16" class="kvc-tab-icon" aria-hidden="true" /><span class="kvc-tab-text">{{ kvman.t('kvcoder.ui.artifacts.preview') }}</span></button>
          <button type="button" class="kvc-tab" :aria-pressed="mode === 'source'" :aria-label="kvman.t('kvcoder.ui.artifacts.source')" :title="kvman.t('kvcoder.ui.artifacts.source')" data-test="artifact-view-source" @click="mode = 'source'"><Code :size="16" class="kvc-tab-icon" aria-hidden="true" /><span class="kvc-tab-text">{{ kvman.t('kvcoder.ui.artifacts.source') }}</span></button>
        </div>
        <a v-if="openable !== undefined && !onOwn" :href="openable" target="_blank" rel="noopener noreferrer" class="kvc-button kvc-icon-button" :aria-label="kvman.t('kvcoder.ui.artifacts.openUrl')" :title="kvman.t('kvcoder.ui.artifacts.openUrl')" data-test="artifact-open-url"><ExternalLink :size="16" aria-hidden="true" /></a>
        <button v-if="!onOwn" type="button" class="kvc-button kvc-icon-button" :disabled="current === undefined" :aria-label="kvman.t('kvcoder.ui.copy')" :title="kvman.t('kvcoder.ui.copy')" data-test="artifact-copy" @click="copy"><Copy :size="16" aria-hidden="true" /></button>
        <button type="button" class="kvc-button kvc-icon-button" :aria-label="kvman.t('kvcoder.ui.artifacts.close')" :title="kvman.t('kvcoder.ui.artifacts.close')" data-test="artifact-close" @click="emit('close')"><X :size="16" aria-hidden="true" /></button>
      </div>
    </div>
    <div class="kvc-artifact-body" data-test="artifact-body">
      <ChangesView v-if="onChanges && props.sessionId !== undefined" :session-id="props.sessionId" :list="props.changes" @changed="emit('changed')" @commit="emit('commit')" />
      <ExecutionMap v-else-if="onMap && props.map" :map="props.map" />
      <pre v-else-if="mode === 'source' && current !== undefined" class="kvc-artifact-source" dir="ltr" data-test="artifact-source">{{ body }}</pre>
      <component :is="kvman.View" v-else-if="format === 'markdown' && current !== undefined" :view="markdownView" />
      <ArtifactFrame v-else-if="format === 'html' && current !== undefined" :label="frameLabel" :content="body" />
      <ArtifactUrlFrame v-else-if="format === 'url' && current !== undefined" :label="frameLabel" :content="body" />
    </div>
  </aside>
</template>

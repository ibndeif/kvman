<script setup lang="ts">
import { File, Folder } from '@lucide/vue';
import { computed, ref } from 'vue';
import { editResult, listResult, pathsResult, readFilesResult, readResult, runResult, searchResult, type ReadFile } from './call-results.ts';
import { sizeText } from './call-summary.ts';
import { callKind, type CallView } from './call-view.ts';
import { fieldValue } from './field-rows.ts';
import FieldsView from './FieldsView.vue';
import FoldButton from './FoldButton.vue';
import FoldedLines from './FoldedLines.vue';
import FoldedOutput from './FoldedOutput.vue';
import HostPath from './HostPath.vue';
import { useKvman } from './kvman.ts';
import RunOutput from './RunOutput.vue';
import { folded, numberedLines } from './shown-lines.ts';

// What a call returned, by its kind (ADR 0036, 3): an edit's count, a read's numbered lines, each file of a read-files (ADR 0097, 1), a list's rows, a find's paths (ADR 0090, 2), a search's
// matches under each file, a helper's answer in Markdown, a background run's row and output (ADR 0062, 2). Any other result that is JSON shows as fields, and the rest as text.
const props = defineProps<{ view: CallView; output: string; result?: unknown }>();
const kvman = useKvman();
const kind = computed(() => callKind(props.view));
const edited = computed(() => (kind.value === 'edit' ? editResult(props.result) : undefined));
const read = computed(() => (kind.value === 'read' ? readResult(props.result) : undefined));
const readFiles = computed(() => (kind.value === 'read-files' ? readFilesResult(props.result) : undefined));
const fileNote = (file: ReadFile): string => file.error ?? kvman.t(file.state === 'notRead' ? 'kvcoder.ui.call.fileNotRead' : 'kvcoder.ui.call.fileUnchanged');
const entries = computed(() => (kind.value === 'list' ? listResult(props.result) : undefined));
const files = computed(() => (kind.value === 'search' ? searchResult(props.result) : undefined));
const paths = computed(() => (kind.value === 'find' ? pathsResult(props.result) : undefined));
const allPaths = ref(false);
const shownPaths = computed(() => folded(paths.value ?? [], allPaths.value));
const run = computed(() => (kind.value === 'run-output' ? runResult(props.result) : undefined));
const allEntries = ref(false);
const shownEntries = computed(() => folded(entries.value ?? [], allEntries.value));
const answer = computed(() => ({ type: 'markdown' as const, text: 'kvcoder.markdown', params: { text: props.output } }));
// A listed entry's path in the workspace: the listed folder, then its name.
const listedFolder = computed(() => (typeof props.view.fields?.['path'] === 'string' ? props.view.fields['path'].replace(/[\\/]+$/, '') : '.'));
const entryPath = (name: string): string => (listedFolder.value === '.' || listedFolder.value === '' ? name : `${listedFolder.value}/${name}`);
const asFields = computed(() => kind.value !== 'line' && typeof props.result === 'object' && props.result !== null);
</script>

<template>
  <p v-if="edited !== undefined" class="kvc-muted kvc-call-parts" data-test="call-replacements">{{ kvman.t('kvcoder.ui.call.replacements', { count: edited.replacements, line: edited.firstChangedLine }) }}</p>
  <FoldedLines v-else-if="read !== undefined" class="kvc-block" :lines="numberedLines(read.content, read.fromLine)" data-test="call-content" />
  <div v-else-if="entries !== undefined" class="kvc-block kvc-entries" data-test="call-entries">
    <div v-for="entry in shownEntries" :key="entry.name" class="kvc-entry" :data-kind="entry.kind" data-test="call-entry">
      <component :is="entry.kind === 'folder' ? Folder : File" :size="14" aria-hidden="true" />
      <span v-if="entry.kind === 'file'" data-test="call-entry-name"><HostPath :path="entryPath(entry.name)" :label="entry.name" /></span>
      <span v-else class="kvc-mono" dir="auto" data-test="call-entry-name">{{ entry.name }}</span>
      <span v-if="entry.kind === 'file'" class="kvc-muted" data-test="call-entry-size">{{ sizeText(kvman.t, entry.bytes) }}</span>
    </div>
    <FoldButton :count="entries.length" :open="allEntries" @toggle="allEntries = !allEntries" />
  </div>
  <div v-else-if="paths !== undefined" class="kvc-block kvc-entries" data-test="call-paths">
    <div v-for="found in shownPaths" :key="found" class="kvc-entry" data-test="call-path">
      <File :size="14" aria-hidden="true" />
      <HostPath :path="found" />
    </div>
    <FoldButton :count="paths.length" :open="allPaths" @toggle="allPaths = !allPaths" />
  </div>
  <template v-else-if="files !== undefined">
    <div v-for="file in files" :key="file.path" class="kvc-block" data-test="call-file">
      <div class="kvc-file-path" data-test="call-file-path"><HostPath :path="file.path" :line="file.matches.find((match) => !match.context)?.line" /></div>
      <FoldedLines v-if="file.matches.length > 0" :lines="file.matches.map((match) => ({ text: match.text, number: match.line }))" />
      <p v-else class="kvc-muted kvc-call-parts" data-test="call-file-count">{{ kvman.t('kvcoder.ui.call.matchCount', { count: file.count }) }}</p>
    </div>
  </template>
  <template v-else-if="readFiles !== undefined">
    <div v-for="(file, index) in readFiles" :key="`${index}:${file.path}`" class="kvc-block" data-test="call-read-file">
      <div class="kvc-file-path" data-test="call-file-path"><HostPath :path="file.path" :line="file.read?.fromLine" /></div>
      <FoldedLines v-if="file.read !== undefined" :lines="numberedLines(file.read.content, file.read.fromLine)" />
      <p v-else class="kvc-muted kvc-call-parts" dir="auto" data-test="call-read-file-note">{{ fileNote(file) }}</p>
    </div>
  </template>
  <template v-else-if="kind === 'write' && asFields" />
  <RunOutput v-else-if="run !== undefined" :run="run" />
  <div v-else-if="kind === 'delegate' && props.output !== ''" class="kvc-block" :aria-label="kvman.t('kvcoder.ui.call.answer')" data-test="call-answer"><component :is="kvman.View" :view="answer" /></div>
  <div v-else-if="asFields" class="kvc-block" :aria-label="kvman.t('kvcoder.ui.output')" data-test="call-result-fields"><FieldsView :value="fieldValue(props.result)" /></div>
  <FoldedOutput v-else-if="props.output !== ''" :output="props.output" />
</template>

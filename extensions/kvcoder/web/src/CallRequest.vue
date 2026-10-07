<script setup lang="ts">
import { computed } from 'vue';
import { editsOf } from './call-summary.ts';
import { callKind, type CallView } from './call-view.ts';
import { diffLines } from './edit-diff.ts';
import { fieldValue } from './field-rows.ts';
import FieldsView from './FieldsView.vue';
import FoldedLines from './FoldedLines.vue';
import { fields, useKvman } from './kvman.ts';
import { numberedLines, plainLines } from './shown-lines.ts';

// What a call asked for, by its kind (ADR 0036, 3): an edit's diffs, a write's content, a line, an `mcp call`'s
// arguments, a delegated task, or any other payload as fields. A read, a list, and a search are all in their closed line.
const props = defineProps<{ view: CallView }>();
const kvman = useKvman();
const kind = computed(() => callKind(props.view));
const payload = computed(() => props.view.fields ?? {});
const diffs = computed(() => editsOf(payload.value).map((edit) => diffLines(edit.oldText, edit.newText)));
const content = computed(() => (typeof payload.value['content'] === 'string' ? payload.value['content'] : ''));
const task = computed(() => (typeof payload.value['task'] === 'string' ? payload.value['task'] : ''));
const shownFields = computed(() => (kind.value === 'mcp-call' ? fields(payload.value['arguments']) : kind.value === 'fields' ? payload.value : {}));
</script>

<template>
  <template v-if="kind === 'edit'"><FoldedLines v-for="(diff, index) in diffs" :key="index" class="kvc-block" :lines="diff" data-test="call-diff" /></template>
  <FoldedLines v-else-if="kind === 'write'" class="kvc-block" :lines="numberedLines(content, 1)" data-test="call-content" />
  <pre v-else-if="kind === 'line'" class="kvc-output kvc-mono" dir="ltr" :aria-label="kvman.t('kvcoder.ui.command')" data-test="call-payload">$ {{ props.view.line }}</pre>
  <FoldedLines v-else-if="kind === 'delegate'" class="kvc-block kvc-prose-lines" :lines="plainLines(task)" :aria-label="kvman.t('kvcoder.ui.call.task')" data-test="call-task" />
  <div v-else-if="Object.keys(shownFields).length > 0" class="kvc-block" :aria-label="kvman.t('kvcoder.ui.call.payload')" data-test="call-payload-fields"><FieldsView :value="fieldValue(shownFields)" /></div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { editsOf } from './call-summary.ts';
import { callKind, type CallView } from './call-view.ts';
import { diffLines } from './edit-diff.ts';
import { fieldValue } from './field-rows.ts';
import FieldsView from './FieldsView.vue';
import FoldedLines from './FoldedLines.vue';
import { fields, useKvman } from './kvman.ts';
import { mcpSteps } from './mcp-steps.ts';
import { numberedLines, plainLines } from './shown-lines.ts';

// What a call asked for, by its kind (ADR 0036, 3): an edit's diffs, a write's content, a line, an `mcp call`'s
// arguments, an `mcp run`'s numbered steps with their arguments (ADR 0084), a delegated task, or any other payload as
// fields. A read, a list, and a search are all in their closed line.
const props = defineProps<{ view: CallView }>();
const kvman = useKvman();
const kind = computed(() => callKind(props.view));
const payload = computed(() => props.view.fields ?? {});
const diffs = computed(() => editsOf(payload.value).map((edit) => diffLines(edit.oldText, edit.newText)));
const content = computed(() => (typeof payload.value['content'] === 'string' ? payload.value['content'] : ''));
const task = computed(() => (typeof payload.value['task'] === 'string' ? payload.value['task'] : ''));
const steps = computed(() => (kind.value === 'mcp-run' ? mcpSteps(payload.value) : []));
const shownFields = computed(() => (kind.value === 'mcp-call' ? fields(payload.value['arguments']) : kind.value === 'fields' ? payload.value : {}));
</script>

<template>
  <template v-if="kind === 'edit'"><FoldedLines v-for="(diff, index) in diffs" :key="index" class="kvc-block" :lines="diff" data-test="call-diff" /></template>
  <FoldedLines v-else-if="kind === 'write'" class="kvc-block" :lines="numberedLines(content, 1)" data-test="call-content" />
  <pre v-else-if="kind === 'line'" class="kvc-output kvc-mono" dir="ltr" :aria-label="kvman.t('kvcoder.ui.command')" data-test="call-payload">$ {{ props.view.line }}</pre>
  <ol v-else-if="steps.length > 0" class="kvc-block kvc-steps" :aria-label="kvman.t('kvcoder.ui.call.payload')" data-test="call-steps">
    <li v-for="(step, index) in steps" :key="index" data-test="call-step">
      <span class="kvc-mono" dir="ltr" data-test="call-step-tool">{{ step.label }}</span>
      <div class="kvc-step-arguments"><FieldsView :value="fieldValue(step.arguments)" /></div>
    </li>
  </ol>
  <FoldedLines v-else-if="kind === 'delegate'" class="kvc-block kvc-prose-lines" :lines="plainLines(task)" :aria-label="kvman.t('kvcoder.ui.call.task')" data-test="call-task" />
  <div v-else-if="Object.keys(shownFields).length > 0" class="kvc-block" :aria-label="kvman.t('kvcoder.ui.call.payload')" data-test="call-payload-fields"><FieldsView :value="fieldValue(shownFields)" /></div>
</template>

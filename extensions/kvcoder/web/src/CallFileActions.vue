<script setup lang="ts">
import { FileDiff } from '@lucide/vue';
import { computed } from 'vue';
import type { CallView } from './call-view.ts';
import { absolutePath, fileName, fileTarget, previewInput } from './host-files.ts';
import { toastProblem, useKvman } from './kvman.ts';

// A file call's row in a host that embeds kvwebui (plan 08 §8.7, ADR 0100, 17 and 18): its path opens in the host's
// editor, and an edit or a write has "Open diff": waiting for approval, the file against the proposed one; after it
// ran, the host's Git diff. Outside embedded mode the row isn't shown.
const props = defineProps<{ view: CallView; result?: unknown; pending?: boolean | undefined; ran?: boolean | undefined }>();
const kvman = useKvman();
const target = computed(() => fileTarget(props.view, props.result));
const preview = computed(() => previewInput(props.view));
const canDiff = computed(() => preview.value !== undefined && (props.pending === true || props.ran === true));
const shown = computed(() => kvman.host.embedded && (target.value !== undefined || canDiff.value));
const absolute = (requested: string): string => absolutePath(kvman.workspace.value.path, requested);

async function openDiff(): Promise<void> {
  const input = preview.value;
  if (input === undefined) return;
  if (props.pending !== true) return kvman.host.openChange(absolute(input.path));
  try {
    const answer = await kvman.exec('kvcoder.file.preview.get', input);
    kvman.host.openDiff(kvman.t('kvcoder.ui.host.proposed', { name: fileName(input.path) }), answer.path, answer.after);
  } catch (error) {
    toastProblem(kvman, error);
  }
}
</script>

<template>
  <div v-if="shown" class="kvc-card-row kvc-file-actions" data-test="file-actions">
    <button v-if="target" type="button" class="kvc-link-button kvc-mono kvc-oneline" dir="ltr" :title="target.path" data-test="open-file" @click="kvman.host.openFile(absolute(target.path), target.line)">{{ target.path }}</button>
    <button v-if="canDiff" type="button" class="kvc-button" data-test="open-diff" @click="openDiff"><FileDiff :size="14" aria-hidden="true" />{{ kvman.t('kvcoder.ui.host.openDiff') }}</button>
  </div>
</template>

<script setup lang="ts">
import { ChevronDown, ChevronRight } from '@lucide/vue';
import { reactive } from 'vue';
import { absolutePath } from './host-files.ts';
import { toastProblem, useKvman } from './kvman.ts';
import type { ChangeList, ChangedFile } from './use-changes.ts';

// The chat's changes in the panel (plan 08 §8.7, ADR 0093, 2): each file with its counts and state, its diff on a
// press, and Undo; Commit asks the agent to commit them, as the person's message. In a host that embeds kvwebui, a
// file that is there also opens in the host's editor (ADR 0100, 18).
const props = defineProps<{ sessionId: string; list: ChangeList | undefined }>();
const emit = defineEmits<{ changed: []; commit: [] }>();
const kvman = useKvman();
const opened = reactive(new Set<string>());
const busy = reactive(new Set<string>());

const lineKind = (line: string): string => (line.startsWith('+++') || line.startsWith('---') ? 'head' : line.startsWith('+') ? 'added' : line.startsWith('-') ? 'removed' : line.startsWith('@@') ? 'hunk' : 'context');

async function undo(file: ChangedFile): Promise<void> {
  busy.add(file.path);
  try {
    await kvman.exec('kvcoder.change.undo', { sessionId: props.sessionId, path: file.path });
    emit('changed');
  } catch (error) {
    toastProblem(kvman, error);
  } finally {
    busy.delete(file.path);
  }
}
</script>

<template>
  <div class="kvc-changes" data-test="changes">
    <p v-if="props.list === undefined" class="kvc-muted">{{ kvman.t('kvcoder.ui.changes.loading') }}</p>
    <template v-else>
      <p class="kvc-muted" data-test="changes-note">{{ kvman.t(props.list.diffs ? 'kvcoder.ui.changes.note' : 'kvcoder.ui.changes.noGit') }}</p>
      <div class="kvc-actions">
        <button type="button" class="kvc-button kvc-primary" :disabled="props.list.files.length === 0" data-test="changes-commit" @click="emit('commit')">{{ kvman.t('kvcoder.ui.changes.commit') }}</button>
      </div>
      <div v-for="file in props.list.files" :key="file.path" class="kvc-card" data-test="change-file">
        <div class="kvc-card-row">
          <button type="button" class="kvc-ghost kvc-button kvc-change-head" :aria-expanded="opened.has(file.path)" :disabled="file.diff === ''" data-test="change-open" @click="opened.has(file.path) ? opened.delete(file.path) : opened.add(file.path)">
            <component :is="opened.has(file.path) ? ChevronDown : ChevronRight" :size="16" aria-hidden="true" />
            <span class="kvc-mono kvc-oneline" dir="ltr" data-test="change-path">{{ file.path }}</span>
            <span class="kvc-muted" dir="ltr" data-test="change-counts">+{{ file.added }} −{{ file.removed }}</span>
            <span class="kvc-chip" data-test="change-state">{{ kvman.t(`kvcoder.ui.changes.state.${file.state}`) }}</span>
          </button>
          <button v-if="kvman.host.embedded && file.state !== 'deleted'" type="button" class="kvc-button" data-test="change-open-file" @click="kvman.host.openFile(absolutePath(kvman.workspace.value.path, file.path))">{{ kvman.t('kvcoder.ui.host.open') }}</button>
          <button type="button" class="kvc-button" :disabled="busy.has(file.path)" data-test="change-undo" @click="undo(file)">{{ kvman.t('kvcoder.ui.changes.undo') }}</button>
        </div>
        <pre v-if="opened.has(file.path)" class="kvc-block kvc-diff" dir="ltr" data-test="change-diff"><span v-for="(line, index) in file.diff.split('\n')" :key="index" :data-kind="lineKind(line)">{{ line }}
</span></pre>
      </div>
      <p v-if="props.list.files.length === 0" class="kvc-muted" data-test="changes-none">{{ kvman.t('kvcoder.ui.changes.none') }}</p>
    </template>
  </div>
</template>

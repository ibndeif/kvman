<script setup lang="ts">
import { absolutePath } from './host-files.ts';
import { useKvman } from './kvman.ts';

// A workspace path in a result (plan 08 §8.7, ADR 0100, 18): in a host that embeds kvwebui it opens in the host's
// editor, at `line` when given; otherwise it is text.
const props = defineProps<{ path: string; line?: number | undefined; label?: string | undefined }>();
const kvman = useKvman();
</script>

<template>
  <button v-if="kvman.host.embedded" type="button" class="kvc-link-button kvc-mono" dir="auto" data-test="host-path" @click="kvman.host.openFile(absolutePath(kvman.workspace.value.path, props.path), props.line)">{{ props.label ?? props.path }}</button>
  <span v-else class="kvc-mono" dir="auto">{{ props.label ?? props.path }}</span>
</template>

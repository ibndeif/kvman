<script setup lang="ts">
import { useKvman } from './kvman.ts';
import type { ApprovalMode } from './start-settings.ts';

// The new chat's one approval line (ADR 0082, 6): what the loaded mode means in plain words, and "Change", which opens
// kvcoder's configuration, where the full note is. Nothing shows while the mode loads or when it can't load.
const kvman = useKvman();
const props = defineProps<{ mode: ApprovalMode | undefined }>();
</script>

<template>
  <p v-if="props.mode !== undefined" class="kvc-muted kvc-start-note" data-test="approval-line" :data-mode="props.mode">
    {{ kvman.t(`kvcoder.ui.approvalLine.${props.mode}`) }}
    <button type="button" class="kvc-link-button" data-test="approval-config" @click="kvman.navigate('kvwebui.extension', { namespace: 'kvcoder' })">{{ kvman.t('kvcoder.ui.approvalLine.change') }}</button>
  </p>
</template>

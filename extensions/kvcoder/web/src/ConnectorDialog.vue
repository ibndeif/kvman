<script setup lang="ts">
import { X } from '@lucide/vue';
import { onMounted, useTemplateRef } from 'vue';
import { useKvman } from './kvman.ts';

// A connector's own configuration, over the page (plan 08 §8.7, ADR 0020, 2): Escape, a press on the backdrop, or
// Close closes it, and Tab stays inside it.
const props = defineProps<{ name: string }>();
const emit = defineEmits<{ close: [] }>();
const kvman = useKvman();
const dialog = useTemplateRef<HTMLElement>('dialog');

const focusable = (): HTMLElement[] => [...(dialog.value?.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled), input:not(:disabled), textarea:not(:disabled), a[href]') ?? [])];

function onTab(event: KeyboardEvent): void {
  const controls = focusable();
  const edge = event.shiftKey ? controls[0] : controls.at(-1);
  if (document.activeElement !== edge && document.activeElement !== dialog.value) return;
  event.preventDefault();
  (event.shiftKey ? controls.at(-1) : controls[0])?.focus();
}

onMounted(() => dialog.value?.focus());
</script>

<template>
  <div class="kvc-dialog-backdrop" data-test="connector-dialog-backdrop" @click.self="emit('close')">
    <div ref="dialog" class="kvc-dialog" role="dialog" aria-modal="true" :aria-label="kvman.t('kvcoder.config.connectors.configure', { name: props.name })" tabindex="-1" data-test="connector-dialog" @keydown.esc.stop="emit('close')" @keydown.tab="onTab">
      <div class="kvc-dialog-head">
        <span class="kvc-connector-text">
          <span class="kvc-mono kvc-dialog-title" data-test="connector-dialog-title">{{ props.name }}</span>
          <span class="kvc-muted" data-test="connector-dialog-scope">{{ kvman.t(`kvcoder.config.dialog.scope.${kvman.scope.value}`, { name: kvman.workspace.value.name }) }}</span>
        </span>
        <button type="button" class="kvc-button kvc-ghost kvc-icon-button" :aria-label="kvman.t('kvcoder.config.dialog.close')" :title="kvman.t('kvcoder.config.dialog.close')" data-test="connector-dialog-close" @click="emit('close')">
          <X :size="18" aria-hidden="true" />
        </button>
      </div>
      <slot />
    </div>
  </div>
</template>

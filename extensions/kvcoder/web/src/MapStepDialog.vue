<script setup lang="ts">
import { X } from '@lucide/vue';
import { computed, onMounted, useTemplateRef } from 'vue';
import { useKvman } from './kvman.ts';
import LinkedText from './LinkedText.vue';
import type { ExecutionMapView } from './map-layout.ts';

// One step of the execution map, over the page (plan 08 §8.7; ADR 0074, 2; ADR 0075, 1; ADR 0086, 4): its title and status, then its
// details as Markdown, what it comes after and uses, how it is checked, its evidence, and its note. Escape, a press on the
// backdrop, or Close closes it, and Tab stays inside it. It shows the step as the map has it now.
const props = defineProps<{ step: ExecutionMapView['steps'][number]; after: readonly string[] }>();
const emit = defineEmits<{ close: [] }>();
const kvman = useKvman();
const dialog = useTemplateRef<HTMLElement>('dialog');
const details = computed(() => ({ type: 'markdown' as const, text: 'kvcoder.markdown', params: { text: props.step.details ?? '' } }));

const focusable = (): HTMLElement[] => [...(dialog.value?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]') ?? [])];

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
  <div class="kvc-dialog-backdrop" data-test="map-detail-backdrop" @click.self="emit('close')">
    <div ref="dialog" class="kvc-dialog kvc-map-dialog" role="dialog" aria-modal="true" :aria-label="props.step.title" tabindex="-1" data-test="map-detail" @keydown.esc.stop="emit('close')" @keydown.tab="onTab">
      <div class="kvc-dialog-head">
        <span class="kvc-connector-text">
          <span class="kvc-muted" :data-status="props.step.status" data-test="map-detail-status">{{ kvman.t('kvcoder.ui.map.step') }} · {{ kvman.t(`kvcoder.ui.map.status.${props.step.status}`) }}</span>
          <span class="kvc-dialog-title" dir="auto" data-test="map-detail-title">{{ props.step.title }}</span>
        </span>
        <button type="button" class="kvc-button kvc-ghost kvc-icon-button" :aria-label="kvman.t('kvcoder.ui.map.close')" :title="kvman.t('kvcoder.ui.map.close')" data-test="map-detail-close" @click="emit('close')">
          <X :size="18" aria-hidden="true" />
        </button>
      </div>
      <dl class="kvc-fields">
        <div v-if="props.step.details !== null" class="kvc-field-row kvc-map-details" data-test="map-details"><dt class="kvc-muted">{{ kvman.t('kvcoder.ui.map.details') }}</dt><dd dir="auto"><component :is="kvman.View" :view="details" /></dd></div>
        <div v-if="props.after.length > 0" class="kvc-field-row" data-test="map-after"><dt class="kvc-muted">{{ kvman.t('kvcoder.ui.map.after') }}</dt><dd dir="auto">{{ props.after.join(' · ') }}</dd></div>
        <div v-if="props.step.uses !== null" class="kvc-field-row"><dt class="kvc-muted">{{ kvman.t('kvcoder.ui.map.uses') }}</dt><dd dir="auto">{{ props.step.uses }}</dd></div>
        <div class="kvc-field-row"><dt class="kvc-muted">{{ kvman.t('kvcoder.ui.map.check') }}</dt><dd dir="auto"><LinkedText :text="props.step.check" /></dd></div>
        <div v-if="props.step.evidence !== null" class="kvc-field-row" data-test="map-evidence"><dt class="kvc-muted">{{ kvman.t('kvcoder.ui.map.evidence') }}</dt><dd dir="auto"><LinkedText :text="props.step.evidence" /></dd></div>
        <div v-if="props.step.note !== null" class="kvc-field-row" data-test="map-note"><dt class="kvc-muted">{{ kvman.t('kvcoder.ui.map.note') }}</dt><dd dir="auto"><LinkedText :text="props.step.note" /></dd></div>
      </dl>
    </div>
  </div>
</template>

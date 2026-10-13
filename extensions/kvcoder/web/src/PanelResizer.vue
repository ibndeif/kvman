<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, useTemplateRef } from 'vue';
import { useKvman } from './kvman.ts';
import { draggedWidth, keyWidth, limitedWidth, widthLimits, type Direction, type WidthLimits } from './panel-width.ts';

// The handle on the panel's edge beside the conversation (plan 08 §8.7, ADR 0071, 4): dragging it sets the panel's
// width, the Left and Right keys move it, and a double-click returns to the starting width. It is the panel's first
// child, and the chat area is what holds the panel. The pointer is captured, so a drag goes on over an artifact's frame.
const emit = defineEmits<{ resize: [px: number]; reset: [] }>();
const kvman = useKvman();
const handle = useTemplateRef<HTMLElement>('handle');
const dragging = ref(false);
const measured = ref<{ now: number; limits: WidthLimits } | undefined>(undefined);
const panel = (): HTMLElement | null => handle.value?.parentElement ?? null;
const direction = (element: HTMLElement): Direction => (getComputedStyle(element).direction === 'rtl' ? 'rtl' : 'ltr');

function measure(): { element: HTMLElement; now: number; limits: WidthLimits } | undefined {
  const element = panel();
  const stage = element?.parentElement;
  if (element === null || stage === null || stage === undefined) return undefined;
  const limits = widthLimits(stage.getBoundingClientRect().width, Number.parseFloat(getComputedStyle(document.documentElement).fontSize));
  const now = Math.round(element.getBoundingClientRect().width);
  measured.value = { now, limits };
  return { element, now, limits };
}

const watcher = new ResizeObserver(measure);
onMounted(() => {
  const found = measure();
  if (found === undefined) return;
  watcher.observe(found.element);
  if (found.element.parentElement !== null) watcher.observe(found.element.parentElement);
});
onBeforeUnmount(() => watcher.disconnect());

function start(event: PointerEvent): void {
  if (event.button !== 0) return;
  event.preventDefault();
  handle.value?.setPointerCapture(event.pointerId);
  dragging.value = true;
}

function drag(event: PointerEvent): void {
  const found = dragging.value ? measure() : undefined;
  if (found === undefined) return;
  emit('resize', limitedWidth(draggedWidth(event.clientX, found.element.getBoundingClientRect(), direction(found.element)), found.limits));
}

function onKey(event: KeyboardEvent): void {
  const found = measure();
  const next = found === undefined ? undefined : keyWidth(found.now, event.key, direction(found.element));
  if (found === undefined || next === undefined) return;
  event.preventDefault();
  emit('resize', limitedWidth(next, found.limits));
}
</script>

<template>
  <div
    ref="handle"
    class="kvc-panel-resizer"
    role="separator"
    aria-orientation="vertical"
    tabindex="0"
    :aria-label="kvman.t('kvcoder.ui.artifacts.resize')"
    :title="kvman.t('kvcoder.ui.artifacts.resize')"
    :aria-valuenow="measured?.now"
    :aria-valuemin="measured?.limits.least"
    :aria-valuemax="measured?.limits.most"
    :data-dragging="dragging"
    data-test="panel-resizer"
    @pointerdown="start"
    @pointermove="drag"
    @pointerup="dragging = false"
    @pointercancel="dragging = false"
    @keydown="onKey"
    @dblclick="emit('reset')"
  />
</template>

<script setup lang="ts">
import { Circle, CircleCheck, CircleSlash, CircleX } from '@lucide/vue';
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue';
import '../styles/execution-map.css';
import { useKvman } from './kvman.ts';
import LinkedText from './LinkedText.vue';
import { layoutMap, mapCounts, nodeHeight, type ExecutionMapView, type MapStatus } from './map-layout.ts';
import MapStepDialog from './MapStepDialog.vue';

// The execution map as the person watches it (plan 08 §8.7, ADR 0064): the goal and how far the work is, then a row
// per stage with the steps that can run together side by side, an arrow to each step from the ones it waits on, and
// the findings noted for later. A press on a step opens its dialog (ADR 0074, 2).
const props = defineProps<{ map: ExecutionMapView }>();
const kvman = useKvman();
// The diagram fits the panel's width, which changes with the window (the panel is 40% of the chat, 32 rem at most).
const frame = useTemplateRef<HTMLElement>('frame');
const available = ref<number | undefined>(undefined);
const measure = (): void => void (available.value = frame.value !== null && frame.value.clientWidth > 0 ? frame.value.clientWidth : undefined);
const watcher = new ResizeObserver(measure);
onMounted(() => {
  measure();
  if (frame.value !== null) watcher.observe(frame.value);
});
onBeforeUnmount(() => watcher.disconnect());
const layout = computed(() => layoutMap(props.map.steps, available.value));
const counts = computed(() => mapCounts(props.map.steps));
const picked = ref<string | undefined>(undefined);
const detail = computed(() => props.map.steps.find((step) => step.id === picked.value));
// A new map that no longer has the step closes its dialog, and one that has it again later doesn't reopen it.
watch(detail, (shown) => {
  if (shown === undefined) picked.value = undefined;
});
const icons: Record<Exclude<MapStatus, 'doing'>, typeof Circle> = { todo: Circle, done: CircleCheck, failed: CircleX, skipped: CircleSlash };
const statusText = (status: MapStatus): string => kvman.t(`kvcoder.ui.map.status.${status}`);
const titleOf = (id: string): string => props.map.steps.find((step) => step.id === id)?.title ?? id;
</script>

<template>
  <div class="kvc-map" data-test="execution-map">
    <p class="kvc-map-goal" dir="auto" data-test="map-goal">{{ props.map.goal }}</p>
    <div class="kvc-map-progress">
      <progress :value="counts.done" :max="counts.total" :aria-label="kvman.t('kvcoder.ui.map.title')" />
      <span class="kvc-muted" data-test="map-progress">{{ kvman.t('kvcoder.ui.map.progress', counts) }}</span>
    </div>
    <div ref="frame" class="kvc-map-scroll">
      <div class="kvc-map-canvas" :style="{ inlineSize: `${layout.width}px`, blockSize: `${layout.height}px` }">
        <svg class="kvc-map-edges kvc-flip" :viewBox="`0 0 ${layout.width} ${layout.height}`" :width="layout.width" :height="layout.height" aria-hidden="true">
          <defs><marker id="kvc-map-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M 0 0 L 8 4 L 0 8 z" /></marker></defs>
          <path v-for="edge in layout.edges" :key="`${edge.from}>${edge.to}`" :d="edge.path" :data-reached="edge.reached" marker-end="url(#kvc-map-arrow)" data-test="map-edge" />
        </svg>
        <button
          v-for="node in layout.nodes"
          :key="node.step.id"
          type="button"
          class="kvc-map-step"
          :style="{ insetInlineStart: `${node.x}px`, insetBlockStart: `${node.y}px`, inlineSize: `${layout.stepWidth}px`, blockSize: `${nodeHeight}px` }"
          :data-status="node.step.status"
          :title="node.step.title"
          aria-haspopup="dialog"
          :aria-label="`${node.step.title}: ${statusText(node.step.status)}`"
          :data-test="`map-step-${node.step.id}`"
          @click="picked = node.step.id"
        >
          <span v-if="node.step.status === 'doing'" class="kvc-spin" aria-hidden="true" />
          <component :is="icons[node.step.status]" v-else :size="16" aria-hidden="true" />
          <span class="kvc-map-step-title" dir="auto">{{ node.step.title }}</span>
        </button>
      </div>
    </div>
    <MapStepDialog v-if="detail !== undefined" :step="detail" :after="detail.after.map(titleOf)" @close="picked = undefined" />
    <section v-if="props.map.notes.length > 0" class="kvc-map-noted" data-test="map-noted">
      <h3>{{ kvman.t('kvcoder.ui.map.noted', { count: props.map.notes.length }) }}</h3>
      <ul><li v-for="(note, index) in props.map.notes" :key="index" dir="auto"><LinkedText :text="note.text" /></li></ul>
    </section>
  </div>
</template>

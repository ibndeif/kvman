<script setup lang="ts">
import type { ComponentRenderProps } from '@openuidev/vue-lang';
import { ChevronLeft, ChevronRight } from '@lucide/vue';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { CarouselProps } from '../definitions/overlays.ts';
import { useRightToLeft } from '../charts/direction.ts';
import { RenderedValue } from './RenderedValue.ts';

// OpenUI's Carousel, in both libraries (plan 06 §6.1, ADR 0124, 16): slides side by side that scroll with snapping, by
// Previous and Next or the arrow keys, mirrored right to left. Local, so it works without live.
const component = defineProps<ComponentRenderProps<CarouselProps>>();
const { t } = useI18n();
const rightToLeft = useRightToLeft();
const track = ref<HTMLElement | null>(null);
const slides = computed(() => component.props.children ?? []);
const surfaces = { card: 'border border-line bg-surface', sunk: 'bg-sunken' };

// `toward` 1 is the next slide, at the inline end; scrolling goes left for it right to left.
function move(toward: 1 | -1): void {
  const element = track.value;
  if (element === null) return;
  element.scrollBy(toward * (rightToLeft.value ? -1 : 1) * element.clientWidth * 0.8, 0);
}

function onKey(event: KeyboardEvent): void {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  event.preventDefault();
  const right = event.key === 'ArrowRight';
  move(right === rightToLeft.value ? -1 : 1);
}
</script>

<template>
  <div class="flex min-w-0 flex-col gap-2" role="region" :aria-roledescription="t('kvwebui.openui.carousel')">
    <div ref="track" class="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1" tabindex="0" data-test="carousel-track" @keydown="onKey">
      <div v-for="(slide, index) in slides" :key="index" class="flex w-4/5 max-w-sm shrink-0 snap-start flex-col gap-2 rounded-xl p-3" :class="surfaces[component.props.variant ?? 'card']" data-test="carousel-slide">
        <RenderedValue :value="slide" :render-node="component.renderNode" />
      </div>
    </div>
    <div v-if="slides.length > 1" class="flex justify-end gap-2">
      <button type="button" class="grid size-8 place-items-center rounded-lg border border-line bg-surface" :aria-label="t('kvwebui.openui.previousSlide')" data-test="carousel-previous" @click="move(-1)">
        <ChevronLeft class="size-4 rtl:-scale-x-100" aria-hidden="true" />
      </button>
      <button type="button" class="grid size-8 place-items-center rounded-lg border border-line bg-surface" :aria-label="t('kvwebui.openui.nextSlide')" data-test="carousel-next" @click="move(1)">
        <ChevronRight class="size-4 rtl:-scale-x-100" aria-hidden="true" />
      </button>
    </div>
  </div>
</template>

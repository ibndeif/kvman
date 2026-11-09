<script setup lang="ts">
import type { ComponentRenderProps } from '@openuidev/vue-lang';
import { computed, ref } from 'vue';
import type { ImageGalleryProps } from '../definitions/media.ts';
import OpenuiDialog from './OpenuiDialog.vue';
import OpenuiImage from './OpenuiImage.vue';

// OpenUI's ImageGallery (plan 06 §6.1, ADR 0124, 7 and 16): a grid of images; pressing one shows it larger, with its
// details, in a dialog. Local, so it works without live.
const component = defineProps<ComponentRenderProps<ImageGalleryProps>>();
const images = computed(() => component.props.images ?? []);
const previewed = ref<number>();
const preview = computed(() => (previewed.value === undefined ? undefined : images.value[previewed.value]));
</script>

<template>
  <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
    <button v-for="(picture, index) in images" :key="index" type="button" class="m-0 overflow-hidden rounded-lg border border-line bg-sunken p-0" :aria-label="picture.alt ?? picture.src" @click="previewed = index">
      <OpenuiImage class="aspect-square w-full" :src="picture.src" :alt="picture.alt ?? ''" />
    </button>
  </div>
  <OpenuiDialog v-if="preview !== undefined" :title="preview.alt ?? preview.src" size="lg" @close="previewed = undefined">
    <OpenuiImage class="w-full" :src="preview.src" :alt="preview.alt ?? ''" />
    <p v-if="preview.details !== undefined" dir="auto" class="m-0 text-sm text-muted">{{ preview.details }}</p>
  </OpenuiDialog>
</template>

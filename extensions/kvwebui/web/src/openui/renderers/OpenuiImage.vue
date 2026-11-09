<script setup lang="ts">
import { z } from '@kvman/sdk';
import { computed, ref, watch } from 'vue';
import { useKvwebui } from '../../state/kvwebui.ts';

// An image in OpenUI (plan 06 §6.1, ADR 0124, 7 and 19): a `data:` image draws; a path in the workspace draws through
// `kvwebui.image.get`; anything else, a web address included, or a path that can't be read, is a placeholder with its
// alternative text and its address, so nothing loads from the network.
const props = defineProps<{ src: string; alt: string }>();
const state = useKvwebui();
const imageSchema = z.object({ type: z.string(), data: z.string() });
const read = ref<string>();
const failed = ref(false);
const addressed = computed(() => /^[a-z][a-z0-9+.-]*:/i.test(props.src));
const shown = computed(() => (props.src.startsWith('data:image/') ? props.src : read.value));

watch(
  () => props.src,
  async (source) => {
    read.value = undefined;
    failed.value = false;
    if (source === '' || /^[a-z][a-z0-9+.-]*:/i.test(source)) return;
    try {
      const image = imageSchema.parse(await state.api.query('kvwebui.image.get', { path: source }));
      if (source === props.src) read.value = `data:${image.type};base64,${image.data}`;
    } catch {
      if (source === props.src) failed.value = true;
    }
  },
  { immediate: true },
);
</script>

<template>
  <img v-if="shown !== undefined" :src="shown" :alt="props.alt" class="block max-w-full rounded-lg object-cover" />
  <span v-else-if="addressed || failed || props.src === ''" dir="auto" class="kvwebui-openui-image inline-block rounded-lg border border-dashed border-line px-2 py-0.5 text-xs text-muted" data-test="openui-image-placeholder">{{ props.alt }}<template v-if="props.src !== ''"> ({{ props.src }})</template></span>
  <span v-else class="inline-block min-h-8 min-w-8 rounded-lg bg-sunken" aria-busy="true" :aria-label="props.alt" />
</template>

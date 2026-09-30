<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';

// A button that opens a menu below it; a click outside or Escape closes it.
const props = defineProps<{ label: string; width?: string }>();
const open = ref(false);
const root = ref<HTMLElement>();

const close = (): void => {
  open.value = false;
};
const onDocumentClick = (event: MouseEvent): void => {
  if (event.target instanceof Node && root.value?.contains(event.target) !== true) close();
};
const onKey = (event: KeyboardEvent): void => {
  if (event.key === 'Escape') close();
};
onMounted(() => {
  document.addEventListener('click', onDocumentClick);
  document.addEventListener('keydown', onKey);
});
onUnmounted(() => {
  document.removeEventListener('click', onDocumentClick);
  document.removeEventListener('keydown', onKey);
});
</script>

<template>
  <div ref="root" class="relative">
    <button type="button" :aria-label="props.label" :aria-expanded="open" aria-haspopup="menu" class="flex h-9 items-center gap-2 rounded-xl px-2.5" @click="open = !open">
      <slot name="trigger" :open="open" />
    </button>
    <div
      v-if="open"
      role="menu"
      :class="props.width ?? 'w-56'"
      class="absolute end-0 top-full z-30 mt-1.5 flex flex-col rounded-2xl border border-line bg-surface p-1.5 shadow-xl"
    >
      <slot :close="close" />
    </div>
  </div>
</template>

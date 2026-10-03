<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';

// A dialog over the page: Escape or a click on the backdrop closes it.
const props = defineProps<{ label: string; wide?: boolean }>();
const emit = defineEmits<{ close: [] }>();

const onKey = (event: KeyboardEvent): void => {
  if (event.key === 'Escape') emit('close');
};
onMounted(() => document.addEventListener('keydown', onKey));
onUnmounted(() => document.removeEventListener('keydown', onKey));
</script>

<template>
  <div class="fixed inset-0 z-40 grid place-items-center bg-black/30 p-4" @click.self="emit('close')">
    <div role="dialog" aria-modal="true" :aria-label="props.label" class="flex max-h-[calc(100dvh-2rem)] w-full flex-col gap-4 overflow-y-auto rounded-2xl bg-surface p-6 shadow-2xl" :class="props.wide ? 'max-w-2xl' : 'max-w-md'">
      <slot />
    </div>
  </div>
</template>

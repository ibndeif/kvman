<script setup lang="ts">
import { Check, ChevronDown } from '@lucide/vue';
import { computed, ref, useTemplateRef, type Component } from 'vue';
import { useDismiss } from './use-dismiss.ts';

// A button that opens a short list to pick one of (ADR 0071, 1 and 5): the thinking level of the send box, and what the
// artifact panel shows. The button holds the current choice on one line; Up and Down move through the open list, Enter
// picks, Escape and a press outside close. The list is kvcoder's own, so its place is the stylesheet's: under its
// button, and above it in the send box.
const props = defineProps<{ options: { id: string; label: string }[]; current: string | undefined; label: string; test: string; disabled?: boolean; icon?: Component | undefined }>();
const emit = defineEmits<{ pick: [id: string] }>();
const open = ref(false);
const highlight = ref(0);
const root = useTemplateRef<HTMLElement>('root');
const trigger = useTemplateRef<HTMLButtonElement>('trigger');
const shown = computed(() => props.options.find((option) => option.id === props.current)?.label ?? '');

function close(): void {
  open.value = false;
}

function toggle(): void {
  highlight.value = Math.max(props.options.findIndex((option) => option.id === props.current), 0);
  open.value = !open.value;
}

function pick(id: string | undefined): void {
  if (id === undefined) return;
  emit('pick', id);
  close();
  trigger.value?.focus();
}

function onKey(event: KeyboardEvent): void {
  if (!open.value || props.options.length === 0) return;
  const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
  if (step === 0 && event.key !== 'Enter') return;
  event.preventDefault();
  if (step === 0) pick(props.options[highlight.value]?.id);
  else highlight.value = (highlight.value + step + props.options.length) % props.options.length;
}

useDismiss(() => open.value, () => root.value, close);
</script>

<template>
  <div ref="root" class="kvc-picker">
    <button ref="trigger" type="button" class="kvc-button" :disabled="props.disabled === true" aria-haspopup="listbox" :aria-expanded="open" :aria-label="`${props.label}: ${shown}`" :title="shown" :data-test="props.test" @click="toggle" @keydown="onKey">
      <component :is="props.icon" v-if="props.icon" :size="16" class="kvc-picker-icon" aria-hidden="true" /><span class="kvc-picker-label">{{ shown }}</span><ChevronDown :size="16" aria-hidden="true" />
    </button>
    <div v-if="open" class="kvc-popover kvc-choices" role="listbox" :aria-label="props.label" :data-test="`${props.test}-list`">
      <div v-for="(option, index) in props.options" :key="option.id" class="kvc-model" role="option" :aria-selected="option.id === props.current" :data-active="index === highlight" :title="option.label" :data-test="`${props.test}-${option.id}`" @click="pick(option.id)" @mousemove="highlight = index">
        <span class="kvc-model-name">{{ option.label }}</span><Check v-if="option.id === props.current" :size="16" aria-hidden="true" />
      </div>
    </div>
  </div>
</template>

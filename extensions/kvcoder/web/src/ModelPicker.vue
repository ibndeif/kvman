<script setup lang="ts">
import { Check, ChevronDown, Search } from '@lucide/vue';
import { computed, nextTick, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue';
import { useKvman } from './kvman.ts';
import { searchGroups, type ModelGroup } from './model-groups.ts';

// The model picker (plan 08 §8.7, ADR 0009, 140): a button that opens a searchable list of the models, grouped by
// provider. Every word typed must be in a model's name or id; arrows and Enter pick, Esc and a click outside close. The
// list opens at its button and is moved only as far as it takes to stay inside the conversation, and is fitted again on
// every frame while it is open, since the header can move the button without changing the conversation's size (ADR 0009,
// 211 and 221). With `none`, the list starts with that entry, for a setting that can be empty (ADR 0015, 3): it says
// `none` when picked, and is left out while the person searches.
const props = defineProps<{ groups: ModelGroup[]; current: string | null; empty?: string | undefined; none?: string | undefined; disabled?: boolean }>();
const emit = defineEmits<{ pick: [modelId: string]; none: [] }>();
const kvman = useKvman();
const open = ref(false);
const query = ref('');
const highlight = ref(0);
const trigger = useTemplateRef<HTMLButtonElement>('trigger');
const search = useTemplateRef<HTMLInputElement>('search');
const panel = useTemplateRef<HTMLElement>('panel');
const gutterPx = 24;

const found = computed(() => searchGroups(props.groups, query.value));
const models = computed(() => found.value.groups.flatMap((group) => group.models));
const label = computed(() => props.groups.flatMap((group) => group.models).find((model) => model.id === props.current)?.name ?? props.current ?? props.empty ?? '');
const offersNone = computed(() => props.none !== undefined && query.value.trim() === '');
const first = computed(() => (offersNone.value ? 1 : 0));
const count = computed(() => models.value.length + first.value);
// The highlight counts the entries shown: the `none` entry, when it is offered, then the models.
const indexOf = (modelId: string): number => {
  const index = models.value.findIndex((model) => model.id === modelId);
  return index < 0 ? -1 : index + first.value;
};

function close(): void {
  open.value = false;
  trigger.value?.focus();
}

async function show(): Promise<void> {
  query.value = '';
  highlight.value = Math.max(indexOf(props.current ?? ''), 0);
  shift = 0;
  open.value = true;
  await nextTick();
  keepInside();
  search.value?.focus();
  scrollToHighlight();
}

let shift = 0;
let frame = 0;

function keepInside(): void {
  const list = panel.value;
  const bounds = trigger.value?.closest('.kvc-conversation')?.getBoundingClientRect();
  if (list === null || bounds === undefined) return;
  const box = list.getBoundingClientRect();
  const start = bounds.left + gutterPx - (box.left - shift);
  const end = bounds.right - gutterPx - (box.right - shift);
  const next = start > 0 ? start : end < 0 ? end : 0;
  if (next === shift) return;
  shift = next;
  list.style.translate = `${next}px 0`;
}

function follow(): void {
  keepInside();
  frame = requestAnimationFrame(follow);
}

function scrollToHighlight(): void {
  panel.value?.querySelector('[data-active="true"]')?.scrollIntoView?.({ block: 'nearest' });
}

async function move(step: number): Promise<void> {
  if (count.value === 0) return;
  highlight.value = (highlight.value + step + count.value) % count.value;
  await nextTick();
  scrollToHighlight();
}

function pick(modelId: string | undefined): void {
  if (modelId === undefined) return;
  emit('pick', modelId);
  close();
}

function pickNone(): void {
  emit('none');
  close();
}

function pickHighlighted(): void {
  if (offersNone.value && highlight.value === 0) pickNone();
  else pick(models.value[highlight.value - first.value]?.id);
}

function outside(event: Event): void {
  if (event.target instanceof Node && !trigger.value?.parentElement?.contains(event.target)) open.value = false;
}

watch(query, () => (highlight.value = 0));
watch(open, (isOpen) => {
  if (isOpen) {
    document.addEventListener('pointerdown', outside);
    frame = requestAnimationFrame(follow);
  } else {
    document.removeEventListener('pointerdown', outside);
    cancelAnimationFrame(frame);
  }
});
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', outside);
  cancelAnimationFrame(frame);
});
</script>

<template>
  <div class="kvc-picker">
    <button ref="trigger" type="button" class="kvc-button" aria-haspopup="listbox" :aria-expanded="open" :aria-label="`${kvman.t('kvcoder.ui.model')}: ${label}`" :disabled="props.disabled" data-test="model-picker" @click="open ? close() : show()">
      <span class="kvc-picker-label">{{ label }}</span><ChevronDown :size="16" aria-hidden="true" />
    </button>
    <div v-if="open" ref="panel" class="kvc-popover" data-test="model-popover" @keydown.esc.stop="close">
      <label class="kvc-search"><Search :size="16" aria-hidden="true" />
        <input ref="search" v-model="query" type="search" role="combobox" aria-expanded="true" aria-controls="kvc-models" :placeholder="kvman.t('kvcoder.ui.searchModels')" :aria-label="kvman.t('kvcoder.ui.searchModels')" data-test="model-search" @keydown.down.prevent="move(1)" @keydown.up.prevent="move(-1)" @keydown.enter.prevent="pickHighlighted" />
      </label>
      <div id="kvc-models" class="kvc-options" role="listbox" :aria-label="kvman.t('kvcoder.ui.model')">
        <div v-if="offersNone" class="kvc-model" role="option" :aria-selected="props.current === null" :data-active="highlight === 0" data-test="model-none-entry" @click="pickNone" @mousemove="highlight = 0">
          <span class="kvc-model-name">{{ props.none }}</span><Check v-if="props.current === null" :size="16" aria-hidden="true" />
        </div>
        <template v-for="group in found.groups" :key="group.provider">
          <div class="kvc-group" role="presentation" data-test="model-group">{{ group.title }}</div>
          <div v-for="model in group.models" :key="model.id" class="kvc-model" role="option" :aria-selected="model.id === props.current" :data-active="indexOf(model.id) === highlight" :data-test="`model-${model.id}`" @click="pick(model.id)" @mousemove="highlight = indexOf(model.id)">
            <span class="kvc-model-name">{{ model.name }}</span><Check v-if="model.id === props.current" :size="16" aria-hidden="true" />
          </div>
        </template>
        <p v-if="found.shown === 0" class="kvc-muted kvc-none" data-test="model-none">{{ kvman.t('kvcoder.ui.noModels') }}</p>
      </div>
      <p class="kvc-muted kvc-count" data-test="model-count">{{ kvman.t('kvcoder.ui.modelsCount', { shown: found.shown, total: found.total }) }}</p>
    </div>
  </div>
</template>

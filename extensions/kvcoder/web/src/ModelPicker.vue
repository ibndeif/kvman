<script setup lang="ts">
import { Check, ChevronDown, Search } from '@lucide/vue';
import { computed, nextTick, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue';
import { useKvman } from './kvman.ts';
import { searchGroups, type ModelGroup } from './model-groups.ts';

// The model picker (plan 08 §8.7, ADR 0009, 140): a button that opens a searchable list of the models, grouped by
// provider. Every word typed must be in a model's name or id; arrows and Enter pick, Esc and a click outside close.
const props = defineProps<{ groups: ModelGroup[]; current: string | null }>();
const emit = defineEmits<{ pick: [modelId: string] }>();
const kvman = useKvman();
const open = ref(false);
const query = ref('');
const highlight = ref(0);
const trigger = useTemplateRef<HTMLButtonElement>('trigger');
const search = useTemplateRef<HTMLInputElement>('search');
const panel = useTemplateRef<HTMLElement>('panel');

const found = computed(() => searchGroups(props.groups, query.value));
const models = computed(() => found.value.groups.flatMap((group) => group.models));
const label = computed(() => props.groups.flatMap((group) => group.models).find((model) => model.id === props.current)?.name ?? props.current ?? '');
const indexOf = (modelId: string): number => models.value.findIndex((model) => model.id === modelId);

function close(): void {
  open.value = false;
  trigger.value?.focus();
}

async function show(): Promise<void> {
  query.value = '';
  highlight.value = Math.max(indexOf(props.current ?? ''), 0);
  open.value = true;
  await nextTick();
  search.value?.focus();
  scrollToHighlight();
}

function scrollToHighlight(): void {
  panel.value?.querySelector('[data-active="true"]')?.scrollIntoView?.({ block: 'nearest' });
}

async function move(step: number): Promise<void> {
  if (models.value.length === 0) return;
  highlight.value = (highlight.value + step + models.value.length) % models.value.length;
  await nextTick();
  scrollToHighlight();
}

function pick(modelId: string | undefined): void {
  if (modelId === undefined) return;
  emit('pick', modelId);
  close();
}

function outside(event: Event): void {
  if (event.target instanceof Node && !trigger.value?.parentElement?.contains(event.target)) open.value = false;
}

watch(query, () => (highlight.value = 0));
watch(open, (isOpen) => (isOpen ? document.addEventListener('pointerdown', outside) : document.removeEventListener('pointerdown', outside)));
onBeforeUnmount(() => document.removeEventListener('pointerdown', outside));
</script>

<template>
  <div class="kvc-picker">
    <button ref="trigger" type="button" class="kvc-button" aria-haspopup="listbox" :aria-expanded="open" :aria-label="`${kvman.t('kvcoder.ui.model')}: ${label}`" data-test="model-picker" @click="open ? close() : show()">
      <span class="kvc-picker-label">{{ label }}</span><ChevronDown :size="16" aria-hidden="true" />
    </button>
    <div v-if="open" ref="panel" class="kvc-popover" data-test="model-popover" @keydown.esc.stop="close">
      <label class="kvc-search"><Search :size="16" aria-hidden="true" />
        <input ref="search" v-model="query" type="search" role="combobox" aria-expanded="true" aria-controls="kvc-models" :placeholder="kvman.t('kvcoder.ui.searchModels')" :aria-label="kvman.t('kvcoder.ui.searchModels')" data-test="model-search" @keydown.down.prevent="move(1)" @keydown.up.prevent="move(-1)" @keydown.enter.prevent="pick(models[highlight]?.id)" />
      </label>
      <div id="kvc-models" class="kvc-options" role="listbox" :aria-label="kvman.t('kvcoder.ui.model')">
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

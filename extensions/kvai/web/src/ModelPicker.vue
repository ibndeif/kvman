<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useKvman } from './kvman.ts';
import type { ModelPickerState } from './use-model-picker.ts';

// The model popover (plan 07 §7.3, ADR 0009, 244; ADR 0015, 2), made like the chat's: a focused search box, the models
// under their provider's title, the current one checked, and how many are shown. Keyboard, and closes outside.
const props = defineProps<{ state: ModelPickerState; anchor: HTMLElement | null }>();
const kvman = useKvman();
const root = ref<HTMLElement | null>(null);
const search = ref<HTMLInputElement | null>(null);

const indexOf = (modelId: string): number => props.state.shown.value.findIndex((model) => model.id === modelId);

function choose(modelId: string | undefined): void {
  if (modelId !== undefined) void props.state.pickModel(modelId);
}

function onInput(event: Event): void {
  if (event.target instanceof HTMLInputElement) props.state.setQuery(event.target.value);
}

function close(): void {
  props.state.closePicker();
  props.anchor?.focus();
}

function onPointerDown(event: PointerEvent): void {
  const target = event.target;
  if (!(target instanceof Node)) return;
  if (root.value?.contains(target) === true) return;
  if (props.anchor?.contains(target) === true) return;
  props.state.closePicker();
}

async function scrollToHighlight(): Promise<void> {
  await nextTick();
  const active = root.value?.querySelector('[data-active="true"]');
  if (active instanceof HTMLElement && typeof active.scrollIntoView === 'function') active.scrollIntoView({ block: 'nearest' });
}

onMounted(() => {
  document.addEventListener('pointerdown', onPointerDown);
  search.value?.focus();
});

onUnmounted(() => {
  document.removeEventListener('pointerdown', onPointerDown);
});

watch(() => [props.state.highlighted.value, props.state.loading.value], scrollToHighlight);
</script>

<template>
  <div ref="root" class="kvai-picker" data-test="model-picker" role="dialog" :aria-label="kvman.t('kvai.ui.picker.title')" @keydown.esc.stop.prevent="close">
    <label class="kvai-picker-search">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        ref="search"
        type="search"
        role="combobox"
        aria-expanded="true"
        aria-controls="kvai-picker-models"
        data-test="picker-search"
        :placeholder="kvman.t('kvai.ui.picker.search')"
        :aria-label="kvman.t('kvai.ui.picker.search')"
        :value="props.state.query.value"
        @input="onInput"
        @keydown.down.prevent="props.state.moveHighlight(1)"
        @keydown.up.prevent="props.state.moveHighlight(-1)"
        @keydown.enter.prevent="choose(props.state.shown.value[props.state.highlighted.value]?.id)"
      />
    </label>
    <p v-if="props.state.loading.value" class="kvai-muted kvai-picker-note" role="status">{{ kvman.t('kvai.ui.connection.loading') }}</p>
    <template v-else>
      <p v-for="failure in props.state.failures.value" :key="failure.provider" class="kvai-error kvai-picker-note" data-test="picker-error" role="alert">
        {{ kvman.t(failure.failure.key, failure.failure.params) }}
      </p>
      <p v-if="props.state.callableCount.value === 0" class="kvai-muted kvai-picker-note" data-test="picker-connect" role="status">{{ kvman.t('kvai.ui.picker.connectFirst') }}</p>
      <template v-else>
        <div id="kvai-picker-models" class="kvai-picker-list" role="listbox" :aria-label="kvman.t('kvai.ui.picker.title')">
          <template v-for="group in props.state.groups.value" :key="group.provider">
            <div class="kvai-picker-group" role="presentation" data-test="picker-group">{{ group.title }}</div>
            <div
              v-for="model in group.models"
              :key="model.id"
              class="kvai-picker-option"
              role="option"
              data-test="picker-option"
              :aria-selected="model.id === props.state.current.value"
              :data-active="indexOf(model.id) === props.state.highlighted.value"
              @click="choose(model.id)"
              @mousemove="props.state.setHighlight(indexOf(model.id))"
            >
              <span class="kvai-picker-name">{{ model.name }}</span>
              <svg v-if="model.id === props.state.current.value" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </div>
          </template>
          <p v-if="props.state.shown.value.length === 0" class="kvai-muted kvai-picker-note" data-test="picker-none">{{ kvman.t('kvai.ui.picker.noMatch') }}</p>
        </div>
        <p class="kvai-muted kvai-picker-note" data-test="picker-count">{{ kvman.t('kvai.ui.picker.count', { shown: props.state.shown.value.length, total: props.state.total.value }) }}</p>
      </template>
    </template>
    <p v-if="props.state.pickError.value !== null" class="kvai-error kvai-picker-note" data-test="picker-pick-error" role="alert">
      {{ kvman.t(props.state.pickError.value.key, props.state.pickError.value.params) }}
    </p>
  </div>
</template>

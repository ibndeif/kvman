<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useKvman } from './kvman.ts';
import type { ModelPickerState } from './use-model-picker.ts';

// The "Change model" popover (plan 07 §7.3, ADR 0009, 244): search grouped by provider, keyboard, closes outside.
const props = defineProps<{ state: ModelPickerState; anchor: HTMLElement | null }>();
const kvman = useKvman();
const root = ref<HTMLElement | null>(null);
const search = ref<HTMLInputElement | null>(null);

function selected(modelId: string): boolean {
  const index = props.state.shown.value.findIndex((model) => model.id === modelId);
  return index !== -1 && index === props.state.highlighted.value;
}

function isCurrentDefault(modelId: string, flagged: boolean): boolean {
  return modelId === props.state.defaultId.value || flagged;
}

function choose(modelId: string): void {
  void props.state.pickModel(modelId);
}

function onInput(event: Event): void {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  props.state.setQuery(target.value);
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    props.state.moveHighlight(1);
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    props.state.moveHighlight(-1);
  } else if (event.key === 'Enter') {
    event.preventDefault();
    const current = props.state.shown.value[props.state.highlighted.value];
    if (current !== undefined) choose(current.id);
  } else if (event.key === 'Escape') {
    event.preventDefault();
    props.state.closePicker();
    props.anchor?.focus();
  }
}

function onPointerDown(event: PointerEvent): void {
  const target = event.target;
  if (!(target instanceof Node)) return;
  if (root.value?.contains(target) === true) return;
  if (props.anchor?.contains(target) === true) return;
  props.state.closePicker();
}

onMounted(() => {
  document.addEventListener('pointerdown', onPointerDown);
  search.value?.focus();
});

onUnmounted(() => {
  document.removeEventListener('pointerdown', onPointerDown);
});

watch(
  () => props.state.highlighted.value,
  async () => {
    await nextTick();
    const current = root.value?.querySelector('[aria-selected="true"]');
    if (current instanceof HTMLElement && typeof current.scrollIntoView === 'function') {
      current.scrollIntoView({ block: 'nearest' });
    }
  },
);
</script>

<template>
  <div ref="root" class="kvai-picker" data-test="model-picker" role="dialog" :aria-label="kvman.t('kvai.ui.picker.title')">
    <span class="kvai-search">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <label class="kvai-hidden" for="kvai-picker-search">{{ kvman.t('kvai.ui.picker.searchLabel') }}</label>
      <input
        ref="search"
        id="kvai-picker-search"
        type="search"
        class="kvai-search-input"
        data-test="picker-search"
        :placeholder="kvman.t('kvai.ui.picker.search')"
        :value="props.state.query.value"
        @input="onInput"
        @keydown="onKeyDown"
      />
    </span>
    <p v-if="props.state.loading.value" class="kvai-muted" role="status">{{ kvman.t('kvai.ui.connection.loading') }}</p>
    <template v-else>
      <p
        v-for="failure in props.state.failures.value"
        :key="failure.provider"
        class="kvai-error"
        data-test="picker-error"
        role="alert"
      >
        {{ kvman.t(failure.failure.key, failure.failure.params) }}
      </p>
      <p v-if="props.state.callableCount.value === 0" class="kvai-muted" role="status">
        {{ kvman.t('kvai.ui.picker.connectFirst') }}
      </p>
      <p v-else-if="props.state.shown.value.length === 0" class="kvai-muted" role="status">
        {{ kvman.t('kvai.ui.picker.noMatch') }}
      </p>
      <div v-else class="kvai-picker-list" role="listbox">
        <template v-for="group in props.state.groups.value" :key="group.provider">
          <h3 class="kvai-picker-group" data-test="picker-group">{{ group.title }}</h3>
          <button
            v-for="model in group.models"
            :key="model.id"
            type="button"
            class="kvai-picker-option"
            data-test="picker-option"
            role="option"
            :aria-selected="selected(model.id) ? 'true' : 'false'"
            @click="choose(model.id)"
          >
            <span class="kvai-picker-name">{{ model.name }}</span>
            <span class="kvai-muted kvai-mono">{{ model.id }}</span>
            <span v-if="isCurrentDefault(model.id, model.isDefault)" class="kvai-picker-default">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="kvai-check">
                <path d="M20 6 9 17l-5-5" />
              </svg>
              <span class="kvai-chip" data-tone="info">{{ kvman.t('kvai.ui.models.default') }}</span>
            </span>
          </button>
        </template>
      </div>
      <p v-if="props.state.hidden.value > 0" class="kvai-muted" data-test="picker-narrow" role="status">
        {{ kvman.t('kvai.ui.picker.narrow') }}
      </p>
    </template>
    <p v-if="props.state.pickError.value !== null" class="kvai-error" data-test="picker-pick-error" role="alert">
      {{ kvman.t(props.state.pickError.value.key, props.state.pickError.value.params) }}
    </p>
  </div>
</template>

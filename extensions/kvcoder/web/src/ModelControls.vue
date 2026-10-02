<script setup lang="ts">
import { useKvman } from './kvman.ts';
import { thinkingLevels, type ModelGroup, type Thinking } from './model-groups.ts';
import ModelPicker from './ModelPicker.vue';

// The model picker and the thinking-level select (plan 08 §8.7, ADR 0009, 140), shared by the header of a chat and the
// header of a new chat that has no session yet (ADR 0009, 194).
const props = defineProps<{ groups: ModelGroup[]; model: string | null; thinking: Thinking; empty?: string | undefined }>();
const emit = defineEmits<{ model: [modelId: string]; thinking: [level: Thinking] }>();
const kvman = useKvman();
const chosen = (event: Event): Thinking => thinkingLevels.find((level) => event.target instanceof HTMLSelectElement && level === event.target.value) ?? 'medium';
</script>

<template>
  <ModelPicker :groups="props.groups" :current="props.model" :empty="props.empty" @pick="(modelId) => emit('model', modelId)" />
  <select :value="props.thinking" class="kvc-button" :aria-label="kvman.t('kvcoder.ui.thinking')" data-test="thinking-picker" @change="emit('thinking', chosen($event))">
    <option v-for="level in thinkingLevels" :key="level" :value="level">{{ kvman.t(`kvcoder.ui.thinkingLevels.${level}`) }}</option>
  </select>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import ChoicePicker from './ChoicePicker.vue';
import { useKvman } from './kvman.ts';
import { thinkingLevels, type ModelGroup, type Thinking } from './model-groups.ts';
import ModelPicker from './ModelPicker.vue';

// The model picker and the thinking-level picker (plan 08 §8.7, ADR 0009, 140; ADR 0071, 5), shared by the send box of a
// chat and of a new chat that has no session yet (ADR 0009, 194).
const props = defineProps<{ groups: ModelGroup[]; model: string | null; thinking: Thinking; empty?: string | undefined }>();
const emit = defineEmits<{ model: [modelId: string]; thinking: [level: Thinking] }>();
const kvman = useKvman();
const levels = computed(() => thinkingLevels.map((level) => ({ id: level, label: kvman.t(`kvcoder.ui.thinkingLevels.${level}`) })));

function pickThinking(id: string): void {
  const level = thinkingLevels.find((candidate) => candidate === id);
  if (level !== undefined) emit('thinking', level);
}
</script>

<template>
  <ModelPicker :groups="props.groups" :current="props.model" :empty="props.empty" @pick="(modelId) => emit('model', modelId)" />
  <ChoicePicker test="thinking-picker" :label="kvman.t('kvcoder.ui.thinking')" :current="props.thinking" :options="levels" @pick="pickThinking" />
</template>

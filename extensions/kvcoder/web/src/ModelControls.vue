<script setup lang="ts">
import { computed } from 'vue';
import ChoicePicker from './ChoicePicker.vue';
import { useKvman } from './kvman.ts';
import { levelsOf, nearestLevel, thinkingLevels, type ModelGroup, type Thinking } from './model-groups.ts';
import ModelPicker from './ModelPicker.vue';

// The model picker and the thinking-level picker (plan 08 §8.7, ADR 0009, 140; ADR 0071, 5), shared by the send box of a
// chat and of a new chat that has no session yet (ADR 0009, 194). The thinking picker lists the model's own levels, and a
// model that doesn't think shows it disabled at Off (ADR 0087, 11).
const props = defineProps<{ groups: ModelGroup[]; model: string | null; thinking: Thinking; empty?: string | undefined }>();
const emit = defineEmits<{ model: [modelId: string]; thinking: [level: Thinking] }>();
const kvman = useKvman();
const modelLevels = computed(() => levelsOf(props.groups, props.model));
const levels = computed(() => modelLevels.value.map((level) => ({ id: level, label: kvman.t(`kvcoder.ui.thinkingLevels.${level}`) })));
const shown = computed(() => nearestLevel(modelLevels.value, props.thinking));
const thinks = computed(() => modelLevels.value.some((level) => level !== 'off'));

function pickThinking(id: string): void {
  const level = thinkingLevels.find((candidate) => candidate === id);
  if (level !== undefined) emit('thinking', level);
}
</script>

<template>
  <ModelPicker :groups="props.groups" :current="props.model" :empty="props.empty" @pick="(modelId) => emit('model', modelId)" />
  <ChoicePicker test="thinking-picker" :label="kvman.t('kvcoder.ui.thinking')" :current="shown" :options="levels" :disabled="!thinks" @pick="pickThinking" />
</template>

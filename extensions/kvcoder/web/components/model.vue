<script setup lang="ts">
import '../styles/kvcoder.css';
import ModelSetting from '../src/ModelSetting.vue';

// `kvcoder.model { setting? }` (plan 08 §8.7, ADR 0015, 7; ADR 0069, 3): the model a new chat starts with, in kvcoder's
// configuration, or with `setting: 'kvcoder.delegate.model'` the model a helper uses when its worker names none.
const props = defineProps<{ setting?: 'kvcoder.model' | 'kvcoder.delegate.model' }>();
</script>

<template>
  <ModelSetting v-bind="props.setting === undefined ? {} : { setting: props.setting }" />
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useKvwebui } from '../../state/kvwebui.ts';
import ErrorCard from '../shared/ErrorCard.vue';

// Extensions whose `ui.get` failed or was invalid (plan 06 §6.3): one dismissible card each; the rest are unaffected.
const state = useKvwebui();
const dismissed = ref<string[]>([]);
</script>

<template>
  <template v-for="failure in state.registry.value.failures" :key="failure.extension">
    <ErrorCard
      v-if="!dismissed.includes(failure.extension)"
      :problem="failure.problem"
      title="kvwebui.errors.uiFailed"
      :title-params="{ extension: failure.extension }"
      :dismiss="() => dismissed.push(failure.extension)"
      :data-test="`load-failure-${failure.namespace}`"
    />
  </template>
</template>

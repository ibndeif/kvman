<script setup lang="ts">
import type { Json } from '@kvman/sdk';
import { useQuery } from '../../composables/use-query.ts';
import ErrorCard from '../shared/ErrorCard.vue';
import LoadingRows from '../shared/LoadingRows.vue';

// A data component's query (plan 06 §6.4, §6.7): placeholder rows while it loads, an error card with "Try again" in
// place of the component when it fails, and the data otherwise.
const props = defineProps<{ query: string; input: Record<string, Json> }>();
defineSlots<{ default(scope: { data: Json }): unknown }>();
const { data, problem, loading, rerun } = useQuery(() => props.query, () => props.input);
</script>

<template>
  <LoadingRows v-if="loading" />
  <ErrorCard v-else-if="problem" :problem="problem" :retry="() => void rerun()" data-test="query-failed" />
  <slot v-else-if="data !== undefined" :data="data" />
</template>

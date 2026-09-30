<script setup lang="ts">
import type { Json } from '@kvman/sdk';
import { useQuery } from '../../composables/use-query.ts';
import ErrorCard from '../shared/ErrorCard.vue';

// A data component's query (plan 06 §6.4, §6.7): placeholder rows while it loads, an error card with "Try again" in
// place of the component when it fails, and the data otherwise.
const props = defineProps<{ query: string; input: Record<string, Json> }>();
defineSlots<{ default(scope: { data: Json }): unknown }>();
const { data, problem, loading, rerun } = useQuery(() => props.query, () => props.input);
</script>

<template>
  <div v-if="loading" class="flex flex-col gap-2.5 py-2" data-test="loading" aria-busy="true">
    <div class="h-3.5 w-3/5 rounded-md bg-neutral-soft" />
    <div class="h-3.5 w-4/5 rounded-md bg-neutral-soft" />
    <div class="h-3.5 w-2/5 rounded-md bg-neutral-soft" />
  </div>
  <ErrorCard v-else-if="problem" :problem="problem" :retry="() => void rerun()" data-test="query-failed" />
  <slot v-else-if="data !== undefined" :data="data" />
</template>

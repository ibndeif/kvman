<script setup lang="ts">
import { CircleAlert } from '@lucide/vue';
import { toRef } from 'vue';
import { useI18n } from 'vue-i18n';
import { problemKey, problemParams } from '../../api/problem-text.ts';
import { useQuery } from '../../composables/use-query.ts';
import type { StatusEntry } from '../../contributions/registry.ts';
import { resolveValues, textParams } from '../../contributions/references.ts';

// A contributed status item (plan 06 §6.3): its text filled from its query's output; a failure shows an error mark
// with the translated Problem as its tooltip (ADR 0009, 73).
const props = defineProps<{ item: StatusEntry; tick: number }>();
const { t } = useI18n();
const { data, problem } = useQuery(() => props.item.query, () => resolveValues(props.item.input, {}), toRef(props, 'tick'));
</script>

<template>
  <span v-if="problem" class="flex items-center gap-1.5 text-danger" :title="t(problemKey(problem), problemParams(problem))" :data-test="`status-${props.item.id}`">
    <CircleAlert class="size-3.5" aria-hidden="true" />
    <span class="sr-only">{{ t(problemKey(problem), problemParams(problem)) }}</span>
  </span>
  <span v-else-if="data !== undefined" :data-test="`status-${props.item.id}`">{{ t(props.item.text, textParams(props.item.params, { output: data })) }}</span>
</template>

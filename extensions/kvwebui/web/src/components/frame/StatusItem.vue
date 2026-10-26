<script setup lang="ts">
import { CircleAlert } from '@lucide/vue';
import { computed, onUnmounted, toRef, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { problemKey, problemParams } from '../../api/problem-text.ts';
import { useQuery } from '../../composables/use-query.ts';
import { useViewText } from '../../composables/use-view-text.ts';
import { useKvwebui } from '../../state/kvwebui.ts';
import type { StatusEntry } from '../../contributions/registry.ts';
import { resolve, resolveValues } from '../../contributions/references.ts';

// A contributed status item (plan 06 §6.3): its text filled from its query's output; a failure shows an error mark
// with the translated Problem as its tooltip (ADR 0009, 73). Its input reads the page's route params, and its numbers
// follow the UI language (ADR 0009, 146).
const props = defineProps<{ item: StatusEntry; params: Readonly<Record<string, string>>; tick: number }>();
const { t } = useI18n();
const viewText = useViewText();
const state = useKvwebui();
const { data, problem } = useQuery(() => props.item.query, () => resolveValues(props.item.input, { params: props.params }), toRef(props, 'tick'));

// An item with `titleCount` gives the tab's title its number while it is shown (ADR 0091, 7), and isn't shown at 0; its
// query keeps running, so it shows again when the count rises (ADR 0106, 7).
const count = computed(() => (props.item.titleCount === undefined || data.value === undefined ? undefined : resolve({ $output: props.item.titleCount }, { output: data.value })));
const text = computed(() => (data.value === undefined || count.value === 0 ? undefined : viewText(props.item.text, props.item.params, { output: data.value }, state.language.value)));
watch(count, (value) => {
  if (props.item.titleCount !== undefined) state.titleCounts.set(props.item.id, typeof value === 'number' && value > 0 ? value : 0);
});
onUnmounted(() => state.titleCounts.delete(props.item.id));
</script>

<template>
  <span v-if="problem" class="flex items-center gap-1.5 text-danger" :title="t(problemKey(problem), problemParams(problem))" :data-test="`status-${props.item.id}`">
    <CircleAlert class="size-3.5" aria-hidden="true" />
    <span class="sr-only">{{ t(problemKey(problem), problemParams(problem)) }}</span>
  </span>
  <span v-else-if="text !== undefined" class="truncate" :title="text" :data-test="`status-${props.item.id}`">{{ text }}</span>
</template>

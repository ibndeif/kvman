<script setup lang="ts">
import type { Json } from '@kvman/sdk';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { resolveValues, type Scope } from '../../contributions/references.ts';
import type { View } from '../../contributions/views.ts';
import ErrorCard from '../shared/ErrorCard.vue';
import QueryFrame from './QueryFrame.vue';
import ViewNode from './ViewNode.vue';

// A list: its item view once per row, with the row in scope (plan 06 §6.4).
const props = defineProps<{ view: Extract<View, { type: 'list' }>; scope: Scope }>();
const { t } = useI18n();
const input = computed(() => resolveValues(props.view.input, props.scope));
const notAList = { code: 'VALIDATION_FAILED' as const, message: "The query's output isn't a list." };
const rowsOf = (data: Json): Json[] | undefined => (Array.isArray(data) ? data : undefined);
</script>

<template>
  <QueryFrame v-slot="{ data }" :query="props.view.query" :input="input">
    <ErrorCard v-if="rowsOf(data) === undefined" :problem="notAList" />
    <p v-else-if="rowsOf(data)?.length === 0" class="py-6 text-center text-muted" data-test="list-empty">{{ t(props.view.empty ?? 'kvwebui.empty') }}</p>
    <div v-else class="flex flex-col gap-3">
      <ViewNode v-for="(row, index) in rowsOf(data)" :key="index" :view="props.view.item" :scope="{ ...props.scope, row }" />
    </div>
  </QueryFrame>
</template>

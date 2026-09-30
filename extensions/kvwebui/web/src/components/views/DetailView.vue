<script setup lang="ts">
import type { Json } from '@kvman/sdk';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { resolveValues, type Scope } from '../../contributions/references.ts';
import type { View } from '../../contributions/views.ts';
import ErrorCard from '../shared/ErrorCard.vue';
import QueryFrame from './QueryFrame.vue';
import ValueCell from './ValueCell.vue';

// One object's fields (plan 06 §6.4).
const props = defineProps<{ view: Extract<View, { type: 'detail' }>; scope: Scope }>();
const { t } = useI18n();
const input = computed(() => resolveValues(props.view.input, props.scope));
const asObject = (data: Json): Record<string, Json> | undefined => (typeof data === 'object' && data !== null && !Array.isArray(data) ? (data as Record<string, Json>) : undefined);
const notAnObject = { code: 'VALIDATION_FAILED' as const, message: "The query's output isn't an object." };
</script>

<template>
  <QueryFrame v-slot="{ data }" :query="props.view.query" :input="input">
    <ErrorCard v-if="asObject(data) === undefined" :problem="notAnObject" />
    <dl v-else class="m-0 grid grid-cols-[minmax(8rem,auto)_1fr] items-center gap-x-6 gap-y-3">
      <template v-for="field in props.view.fields" :key="field.field">
        <dt class="text-xs font-medium text-muted">{{ t(field.title) }}</dt>
        <dd class="m-0"><ValueCell :row="asObject(data) ?? {}" :column="field" /></dd>
      </template>
    </dl>
  </QueryFrame>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { resolveValues, type Scope } from '../../contributions/references.ts';
import type { View } from '../../contributions/views.ts';
import QueryFrame from './QueryFrame.vue';
import TableRows from './TableRows.vue';

const props = defineProps<{ view: Extract<View, { type: 'table' }>; scope: Scope }>();
const input = computed(() => resolveValues(props.view.input, props.scope));
</script>

<template>
  <QueryFrame v-slot="{ data }" :query="props.view.query" :input="input">
    <TableRows :view="props.view" :scope="props.scope" :data="data" />
  </QueryFrame>
</template>

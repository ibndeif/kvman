<script setup lang="ts">
import type { ComponentRenderProps } from '@openuidev/vue-lang';
import { computed } from 'vue';
import type { EntityListProps, EntityRow } from '../definitions/lists.ts';

// OpenUI's EntityList (plan 06 §6.1, ADR 0124, 16): rows of a label and a value, a number value in tabular figures read
// left to right; size default may have a header and a footer row, size small has neither.
const component = defineProps<ComponentRenderProps<EntityListProps>>();
const small = computed(() => component.props.size === 'small');
const rows = computed(() => component.props.rows ?? []);
const header = computed<EntityRow | undefined>(() => (small.value ? undefined : component.props.header));
const footer = computed<EntityRow | undefined>(() => (small.value ? undefined : component.props.footer));
const valueClass = (row: EntityRow): string => (row.rightVariant === 'number' ? 'tabular-nums' : '');
</script>

<template>
  <dl class="m-0 flex flex-col" :class="small ? 'gap-1 text-xs' : 'gap-0 text-sm'">
    <div v-if="header !== undefined" class="flex justify-between gap-4 border-b border-line pb-2 font-semibold" data-test="entity-header">
      <dt dir="auto">{{ header.left }}</dt>
      <dd class="m-0" :class="valueClass(header)" :dir="header.rightVariant === 'number' ? 'ltr' : 'auto'">{{ header.right }}</dd>
    </div>
    <div v-for="(row, index) in rows" :key="index" class="flex justify-between gap-4" :class="small ? '' : 'border-b border-line py-2 last:border-b-0'">
      <dt dir="auto" class="text-muted">{{ row.left }}</dt>
      <dd class="m-0 font-medium" :class="valueClass(row)" :dir="row.rightVariant === 'number' ? 'ltr' : 'auto'">{{ row.right }}</dd>
    </div>
    <div v-if="footer !== undefined" class="flex justify-between gap-4 border-t border-line pt-2 font-semibold" data-test="entity-footer">
      <dt dir="auto">{{ footer.left }}</dt>
      <dd class="m-0" :class="valueClass(footer)" :dir="footer.rightVariant === 'number' ? 'ltr' : 'auto'">{{ footer.right }}</dd>
    </div>
  </dl>
</template>

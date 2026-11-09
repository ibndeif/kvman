<script setup lang="ts">
import type { ComponentRenderProps } from '@openuidev/vue-lang';
import { ChevronLeft, ChevronRight } from '@lucide/vue';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { TableProps } from '../definitions/tables.ts';
import { RenderedValue } from './RenderedValue.ts';

// OpenUI's Table (plan 06 §6.1, ADR 0124, 4 and 16): column-oriented, each Col holding one value or component per row,
// 10 rows a page with Previous and Next, as OpenUI's does. A number column reads left to right at the inline end. Paging
// is local, so it works in an old reply too.
const pageSize = 10;
const component = defineProps<ComponentRenderProps<TableProps>>();
const { t } = useI18n();
const page = ref(0);
const asList = (value: unknown): unknown[] => (Array.isArray(value) ? value : value === undefined || value === null ? [] : [value]);
const columns = computed(() => (component.props.columns ?? []).map((column) => ({ label: column.props.label, number: column.props.type === 'number', cells: asList(column.props.data) })));
const rows = computed(() => Math.max(0, ...columns.value.map((column) => column.cells.length)));
const pages = computed(() => Math.max(1, Math.ceil(rows.value / pageSize)));
const shown = computed(() => Math.min(page.value, pages.value - 1));
const visible = computed(() => Array.from({ length: Math.max(0, Math.min(pageSize, rows.value - shown.value * pageSize)) }, (_, index) => shown.value * pageSize + index));
const isElement = (cell: unknown): boolean => typeof cell === 'object' && cell !== null;
</script>

<template>
  <div v-if="columns.length > 0" class="flex min-w-0 flex-col gap-2">
    <div class="overflow-x-auto rounded-xl border border-line">
      <table class="w-full border-collapse text-sm">
        <thead class="bg-sunken">
          <tr>
            <th v-for="(column, index) in columns" :key="index" dir="auto" class="border-b border-line px-3 py-2 font-medium" :class="column.number ? 'text-end' : 'text-start'">{{ column.label }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in visible" :key="row" class="border-b border-line last:border-b-0">
            <td v-for="(column, index) in columns" :key="index" class="px-3 py-2 align-top" :class="column.number ? 'text-end tabular-nums' : 'text-start'" :dir="column.number ? 'ltr' : 'auto'">
              <RenderedValue v-if="isElement(column.cells[row])" :value="column.cells[row]" :render-node="component.renderNode" />
              <template v-else>{{ String(column.cells[row] ?? '') }}</template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-if="pages > 1" class="flex items-center justify-end gap-2 text-sm text-muted">
      <button type="button" class="grid size-7 place-items-center rounded-lg border border-line bg-surface disabled:opacity-50" :aria-label="t('kvwebui.openui.previousPage')" :disabled="shown === 0" @click="page = shown - 1">
        <ChevronLeft class="size-4 rtl:-scale-x-100" aria-hidden="true" />
      </button>
      <span dir="ltr" data-test="table-page">{{ shown + 1 }} / {{ pages }}</span>
      <button type="button" class="grid size-7 place-items-center rounded-lg border border-line bg-surface disabled:opacity-50" :aria-label="t('kvwebui.openui.nextPage')" :disabled="shown >= pages - 1" @click="page = shown + 1">
        <ChevronRight class="size-4 rtl:-scale-x-100" aria-hidden="true" />
      </button>
    </div>
  </div>
</template>

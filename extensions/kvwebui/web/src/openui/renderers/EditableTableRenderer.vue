<script setup lang="ts">
import { useIsStreaming, useOpenUI, useTriggerAction, type ComponentRenderProps } from '@openuidev/vue-lang';
import { computed, inject, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { EditableColumn, EditableTableProps } from '../definitions/tables.ts';
import { formMessagesKey, useOpenuiLive } from '../presses.ts';
import { markdownTable, type EditableRow } from '../table-markdown.ts';
import { textControlClass } from './control-style.ts';

// OpenUI's EditableTable (plan 06 §6.1, ADR 0124, 14, 16): cells the person edits by their column's type; once a cell
// changes, a bar counts the changed cells and offers Reset and "Save changes", which sends that text and the table as
// Markdown, as OpenUI's save does with its form state. Editing works only while the block is live.
const component = defineProps<ComponentRenderProps<EditableTableProps>>();
const { t } = useI18n();
const openui = useOpenUI();
const trigger = useTriggerAction();
const streaming = useIsStreaming();
const live = useOpenuiLive();
const forms = inject(formMessagesKey, undefined);
const columns = computed<EditableColumn[]>(() => component.props.columns ?? []);
const copy = (rows: readonly EditableRow[]): EditableRow[] => rows.map((row) => ({ id: row.id, values: [...row.values] }));
const rows = ref<EditableRow[]>([]);
const baseline = ref<EditableRow[]>([]);
const inputTypes = { text: 'text', number: 'number', 'date-single': 'date', url: 'url', select: 'text' };

watch(
  () => JSON.stringify(component.props.data ?? []),
  () => {
    rows.value = copy(component.props.data ?? []);
    baseline.value = copy(rows.value);
  },
  { immediate: true },
);
watch(streaming, (now) => {
  if (!now) baseline.value = copy(rows.value);
});

const changed = computed(() => rows.value.reduce((count, row, position) => count + row.values.filter((value, index) => value !== baseline.value[position]?.values[index]).length, 0));

function edit(position: number, index: number, column: EditableColumn, event: Event): void {
  if (!(event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement)) return;
  const raw = event.target.value;
  const row = rows.value[position];
  if (row !== undefined) row.values[index] = column.type === 'number' && raw !== '' ? Number(raw) : raw;
}

function save(): void {
  if (!live.value) return;
  const name = component.props.name ?? '';
  forms?.set(name, () => markdownTable(columns.value, rows.value));
  openui.setFieldValue(name, 'EditableTable', name, copy(rows.value), true);
  trigger(t('kvwebui.openui.saveChanges'), name);
  baseline.value = copy(rows.value);
}
</script>

<template>
  <div class="flex min-w-0 flex-col gap-2">
    <div class="overflow-x-auto rounded-xl border border-line">
      <table class="w-full border-collapse text-sm">
        <thead class="bg-sunken">
          <tr>
            <th v-for="(column, index) in columns" :key="index" dir="auto" class="border-b border-line px-3 py-2 text-start font-medium" :style="column.width === undefined ? undefined : { inlineSize: `${column.width}px` }">{{ column.header }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, position) in rows" :key="row.id" class="border-b border-line last:border-b-0">
            <td v-for="(column, index) in columns" :key="index" class="px-2 py-1.5">
              <select v-if="column.type === 'select'" :value="String(row.values[index] ?? '')" :disabled="!live" :class="textControlClass" @change="edit(position, index, column, $event)">
                <option v-for="option in column.options ?? []" :key="option.value" :value="option.value">{{ option.label }}</option>
              </select>
              <input v-else :type="inputTypes[column.type]" :value="row.values[index] ?? ''" :disabled="!live" :dir="column.type === 'text' ? 'auto' : 'ltr'" :class="textControlClass" @input="edit(position, index, column, $event)" />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-if="changed > 0" class="flex items-center justify-between gap-2 text-sm" data-test="table-changes">
      <span class="text-muted">{{ t('kvwebui.openui.changes', { count: changed }, changed) }}</span>
      <span class="flex gap-2">
        <button type="button" class="rounded-lg border border-line bg-surface px-3 py-1.5 disabled:opacity-50" :disabled="!live" @click="rows = copy(baseline)">{{ t('kvwebui.openui.reset') }}</button>
        <button type="button" class="rounded-lg bg-primary px-3 py-1.5 font-medium text-on-primary disabled:opacity-50" :disabled="!live" @click="save">{{ t('kvwebui.openui.saveChanges') }}</button>
      </span>
    </div>
  </div>
</template>

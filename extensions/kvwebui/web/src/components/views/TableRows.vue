<script setup lang="ts">
import type { Json } from '@kvman/sdk';
import { ChevronRight, Search } from '@lucide/vue';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { searchText } from '../../display/formats.ts';
import { resolveValues, type Scope } from '../../contributions/references.ts';
import type { View } from '../../contributions/views.ts';
import { pageLocation } from '../../state/navigation.ts';
import { useKvwebui } from '../../state/kvwebui.ts';
import ErrorCard from '../shared/ErrorCard.vue';
import ButtonView from './ButtonView.vue';
import ValueCell from './ValueCell.vue';

// A table's rows (plan 06 §6.4, ADR 0009, 76): past 10 rows it gets a search box and shows 10, with "Show more" adding
// 25; `rowLink` makes each row open a page; `rowActions` are buttons with the row in scope.
const props = defineProps<{ view: Extract<View, { type: 'table' }>; scope: Scope; data: Json }>();
const state = useKvwebui();
const router = useRouter();
const { t } = useI18n();

const firstRows = 10;
const moreRows = 25;
const search = ref('');
const shown = ref(firstRows);

const rows = computed(() => (Array.isArray(props.data) ? props.data.filter((row): row is Record<string, Json> => typeof row === 'object' && row !== null && !Array.isArray(row)) : undefined));
const searchable = computed(() => (rows.value?.length ?? 0) > firstRows);
const matching = computed(() => {
  const needle = search.value.trim().toLowerCase();
  const all = rows.value ?? [];
  if (needle === '') return all;
  return all.filter((row) => props.view.columns.some((column) => [column.field, column.secondary].some((field) => field !== undefined && searchText(row[field]).toLowerCase().includes(needle))));
});
const visible = computed(() => (searchable.value ? matching.value.slice(0, shown.value) : matching.value));
const notAList = { code: 'VALIDATION_FAILED' as const, message: "The query's output isn't a list of objects." };

const open = async (row: Record<string, Json>): Promise<void> => {
  const link = props.view.rowLink;
  if (link !== undefined) await router.push(pageLocation(state.registry.value, link.page, resolveValues(link.params, { ...props.scope, row })));
};
</script>

<template>
  <ErrorCard v-if="rows === undefined" :problem="notAList" />
  <div v-else class="flex flex-col">
    <label v-if="searchable" class="mb-3 flex h-9 w-65 items-center gap-2 rounded-xl border border-line bg-sunken px-3 text-muted">
      <Search class="size-4" aria-hidden="true" />
      <input v-model="search" type="search" class="w-full bg-transparent text-ink outline-none" :placeholder="t('kvwebui.table.search')" :aria-label="t('kvwebui.table.search')" data-test="table-search" />
    </label>
    <p v-if="matching.length === 0" class="py-6 text-center text-muted" data-test="table-empty">{{ t(props.view.empty ?? 'kvwebui.empty') }}</p>
    <table v-else class="w-full border-collapse">
      <thead>
        <tr>
          <th v-for="column in props.view.columns" :key="column.field" class="border-b border-line px-3 py-2.5 text-start text-xs font-medium text-muted" :class="column.format === 'number' || column.format === 'bytes' ? 'text-end' : ''">
            {{ t(column.title) }}
          </th>
          <th v-if="props.view.rowActions || props.view.rowLink" class="border-b border-line" />
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="(row, index) in visible"
          :key="index"
          :tabindex="props.view.rowLink ? 0 : undefined"
          :role="props.view.rowLink ? 'link' : undefined"
          class="border-b border-line-soft"
          :class="props.view.rowLink ? 'cursor-pointer hover:bg-sunken focus:bg-sunken focus:outline-none' : ''"
          data-test="table-row"
          @click="open(row)"
          @keydown.enter="open(row)"
        >
          <td v-for="column in props.view.columns" :key="column.field" class="px-3 py-2.5" :class="column.format === 'number' || column.format === 'bytes' ? 'text-end tabular-nums' : ''">
            <ValueCell :row="row" :column="column" />
          </td>
          <td v-if="props.view.rowActions || props.view.rowLink" class="px-3 py-2 text-end">
            <div class="flex items-center justify-end gap-2" @click.stop>
              <ButtonView v-for="(action, actionIndex) in props.view.rowActions ?? []" :key="actionIndex" :view="action" :scope="{ ...props.scope, row }" small />
              <ChevronRight v-if="props.view.rowLink" class="size-4.5 text-muted rtl:-scale-x-100" aria-hidden="true" />
            </div>
          </td>
        </tr>
      </tbody>
    </table>
    <div v-if="searchable" class="flex items-center gap-3 pt-3 text-[13px] text-muted">
      <span data-test="table-count">{{ t('kvwebui.table.showing', { shown: String(visible.length), total: String(matching.length) }) }}</span>
      <div class="grow" />
      <button v-if="visible.length < matching.length" type="button" class="h-8 rounded-lg border border-line bg-surface px-3 font-medium text-ink" data-test="table-more" @click="shown += moreRows">
        {{ t('kvwebui.table.showMore') }}
      </button>
    </div>
  </div>
</template>

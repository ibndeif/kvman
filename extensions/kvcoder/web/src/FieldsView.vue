<script setup lang="ts">
import { computed, ref } from 'vue';
import type { FieldValue } from './field-rows.ts';
import FoldButton from './FoldButton.vue';
import FoldedLines from './FoldedLines.vue';
import LinkedText from './LinkedText.vue';
import { folded, plainLines } from './shown-lines.ts';

// A value of a payload or an output as the person reads it (ADR 0036, 9): rows of name and value, a text block for a
// string of several lines, a table for an array of flat objects, one item per line for an array of scalars.
const props = defineProps<{ value: FieldValue }>();
const open = ref(false);
const tableRows = computed(() => (props.value.kind === 'table' ? folded(props.value.rows, open.value) : []));
const items = computed(() => (props.value.kind === 'items' ? folded(props.value.items, open.value) : []));
</script>

<template>
  <span v-if="props.value.kind === 'text'" dir="auto" data-test="field-text"><LinkedText :text="props.value.text" /></span>
  <span v-else-if="props.value.kind === 'empty'" class="kvc-muted" data-test="field-empty">—</span>
  <FoldedLines v-else-if="props.value.kind === 'block'" class="kvc-field-block" :lines="plainLines(props.value.text)" data-test="field-block" />
  <div v-else-if="props.value.kind === 'table'" class="kvc-field-table">
    <table data-test="field-table">
      <thead><tr><th v-for="column in props.value.columns" :key="column" scope="col" dir="ltr">{{ column }}</th></tr></thead>
      <tbody><tr v-for="(row, index) in tableRows" :key="index"><td v-for="(cell, cellIndex) in row" :key="cellIndex" dir="auto"><LinkedText :text="cell" /></td></tr></tbody>
    </table>
    <FoldButton :count="props.value.rows.length" :open="open" @toggle="open = !open" />
  </div>
  <div v-else-if="props.value.kind === 'items'" class="kvc-field-items" data-test="field-items">
    <div v-for="(item, index) in items" :key="index" dir="auto"><LinkedText :text="item" /></div>
    <FoldButton :count="props.value.items.length" :open="open" @toggle="open = !open" />
  </div>
  <dl v-else class="kvc-fields" data-test="call-fields">
    <div v-for="row in props.value.rows" :key="row.name" class="kvc-field-row" :data-name="row.name" data-test="field-row">
      <dt class="kvc-muted" dir="ltr">{{ row.name }}</dt>
      <dd data-test="field-value"><FieldsView :value="row.value" /></dd>
    </div>
  </dl>
</template>

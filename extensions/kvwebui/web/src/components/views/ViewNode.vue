<script setup lang="ts">
import { ChevronRight } from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import { resolveValues, textParams, type Scope } from '../../contributions/references.ts';
import type { View } from '../../contributions/views.ts';
import { pageLocation } from '../../state/navigation.ts';
import { useKvwebui } from '../../state/kvwebui.ts';
import ButtonView from './ButtonView.vue';
import CustomView from './CustomView.vue';
import DetailView from './DetailView.vue';
import FormView from './FormView.vue';
import ListView from './ListView.vue';
import MarkdownView from './MarkdownView.vue';
import TableView from './TableView.vue';

// Renders a view tree with kvwebui's built-in components and extensions' custom ones (plan 06 §6.4). `scope` holds the route params and, inside a
// list item or row action, the current row.
const props = defineProps<{ view: View; scope: Scope }>();
const state = useKvwebui();
const { t } = useI18n();
const gaps = { sm: 'gap-2', md: 'gap-4', lg: 'gap-6' };
const headings = { 1: 'text-[26px] font-semibold tracking-tight', 2: 'text-base font-semibold', 3: 'text-sm font-semibold' };
</script>

<template>
  <div
    v-if="props.view.type === 'stack'"
    class="flex"
    :class="[props.view.direction === 'vertical' ? 'flex-col' : 'flex-row flex-wrap items-center grow min-h-0', gaps[props.view.gap ?? 'md']]"
  >
    <ViewNode v-for="(child, index) in props.view.children" :key="index" :view="child" :scope="props.scope" />
  </div>
  <section v-else-if="props.view.type === 'card'" class="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5">
    <h2 v-if="props.view.title" class="text-base font-semibold">{{ t(props.view.title) }}</h2>
    <ViewNode v-for="(child, index) in props.view.children" :key="index" :view="child" :scope="props.scope" />
  </section>
  <component :is="`h${props.view.level}`" v-else-if="props.view.type === 'heading'" class="m-0" :class="headings[props.view.level]">
    {{ t(props.view.text, textParams(props.view.params, props.scope)) }}
  </component>
  <p v-else-if="props.view.type === 'text'" class="m-0 text-muted">{{ t(props.view.text, textParams(props.view.params, props.scope)) }}</p>
  <MarkdownView v-else-if="props.view.type === 'markdown'" :view="props.view" :scope="props.scope" />
  <TableView v-else-if="props.view.type === 'table'" :view="props.view" :scope="props.scope" />
  <ListView v-else-if="props.view.type === 'list'" :view="props.view" :scope="props.scope" />
  <DetailView v-else-if="props.view.type === 'detail'" :view="props.view" :scope="props.scope" />
  <FormView v-else-if="props.view.type === 'form'" :view="props.view" :scope="props.scope" />
  <RouterLink
    v-else-if="props.view.type === 'link'"
    :to="pageLocation(state.registry.value, props.view.to.page, resolveValues(props.view.to.params, props.scope))"
    class="flex w-fit items-center gap-1 font-medium text-primary"
  >
    {{ t(props.view.text, textParams(props.view.params, props.scope)) }}<ChevronRight class="size-4 rtl:-scale-x-100" aria-hidden="true" />
  </RouterLink>
  <ButtonView v-else-if="props.view.type === 'button'" :view="props.view" :scope="props.scope" />
  <CustomView v-else-if="props.view.type === 'custom'" :view="props.view" :scope="props.scope" />
</template>

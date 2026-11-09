<script setup lang="ts">
import { provideFormName, provideFormValidation, type ComponentRenderProps } from '@openuidev/vue-lang';
import { computed, inject, onUnmounted, provide, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { FormProps } from '../definitions/forms.ts';
import { emptyValue, formFieldsKey } from '../fields.ts';
import { createFormValidation } from '../form-validation.ts';
import { formMessagesKey } from '../presses.ts';
import { RenderedValue } from './RenderedValue.ts';

// OpenUI's Form (plan 06 §6.1, ADR 0124, 14): its controls, then its buttons. It names its controls' state, checks their
// rules in the page's language, and gives the block its `<label>: <value>` lines, one per control, in order.
const component = defineProps<ComponentRenderProps<FormProps>>();
const { t } = useI18n();
const name = computed(() => component.props.name);
const fields = new Map<string, () => string>();
const forms = inject(formMessagesKey, undefined);
provideFormName(name);
provideFormValidation(createFormValidation((key, params) => t(key, params)));
provide(formFieldsKey, fields);

const lines = (): string[] =>
  (component.props.fields ?? []).map((field) => `${field.props.label}: ${fields.get(field.props.input.props.name)?.() ?? emptyValue}`);

watch(
  name,
  (current, previous) => {
    if (previous !== undefined) forms?.delete(previous);
    forms?.set(current, lines);
  },
  { immediate: true },
);
onUnmounted(() => forms?.delete(name.value));
</script>

<template>
  <div role="form" class="flex flex-col gap-4">
    <RenderedValue :value="component.props.fields" :render-node="component.renderNode" />
    <RenderedValue :value="component.props.buttons" :render-node="component.renderNode" />
  </div>
</template>

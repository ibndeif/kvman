<script setup lang="ts">
import { useFormValidation, type ComponentRenderProps } from '@openuidev/vue-lang';
import { CircleAlert } from '@lucide/vue';
import { computed, provide, useId } from 'vue';
import type { FormControlProps } from '../definitions/forms.ts';
import { fieldIdKey } from '../fields.ts';
import { RenderedValue } from './RenderedValue.ts';

// OpenUI's FormControl (plan 06 §6.1, ADR 0124, 16): a label (marked when required), the control, and its rule's error
// or else its hint.
const component = defineProps<ComponentRenderProps<FormControlProps>>();
const validation = useFormValidation();
const id = useId();
provide(fieldIdKey, id);
const fieldName = computed(() => component.props.input.props.name);
const required = computed(() => {
  const rules: unknown = component.props.input.props.rules;
  return typeof rules === 'object' && rules !== null && 'required' in rules && rules.required === true;
});
const error = computed(() => validation?.errors[fieldName.value]);
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <label dir="auto" class="text-sm font-medium" :for="id">
      {{ component.props.label }}<span v-if="required" class="text-danger" aria-hidden="true"> *</span>
    </label>
    <RenderedValue :value="component.props.input" :render-node="component.renderNode" />
    <p v-if="error !== undefined" class="m-0 flex items-center gap-1 text-xs text-danger" role="alert">
      <CircleAlert class="size-3.5 shrink-0" aria-hidden="true" /><span>{{ error }}</span>
    </p>
    <p v-else-if="component.props.hint !== undefined" dir="auto" class="m-0 text-xs text-muted">{{ component.props.hint }}</p>
  </div>
</template>

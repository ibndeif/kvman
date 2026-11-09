<script setup lang="ts">
import type { ComponentRenderProps } from '@openuidev/vue-lang';
import { computed, inject } from 'vue';
import type { InputProps } from '../definitions/forms.ts';
import { fieldIdKey, typedText, useField, useFormField } from '../fields.ts';
import { useOpenuiLive } from '../presses.ts';
import { textControlClass } from './control-style.ts';

// OpenUI's Input (plan 06 §6.1, ADR 0124, 14, 16): a one-line field, bound to a `$variable` or kept in its form.
const component = defineProps<ComponentRenderProps<InputProps>>();
const live = useOpenuiLive();
const id = inject(fieldIdKey, undefined);
const field = useField('Input', () => component.props.name, () => component.props.value);
const text = computed(() => (typeof field.value.value === 'string' ? field.value.value : ''));
const check = useFormField(() => component.props.name, () => component.props.rules, () => text.value, () => typedText(text.value));

function change(event: Event): void {
  if (!(event.target instanceof HTMLInputElement)) return;
  field.set(event.target.value);
  check.validate(event.target.value);
}
</script>

<template>
  <input :id="id" :name="component.props.name" :type="component.props.type ?? 'text'" :placeholder="component.props.placeholder" :value="text" :disabled="!live" dir="auto" :class="textControlClass" @input="change" />
</template>

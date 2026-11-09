<script setup lang="ts">
import { useFormName, useFormValidation, useTriggerAction, type ActionConfig, type ComponentRenderProps } from '@openuidev/vue-lang';
import { computed } from 'vue';
import type { ButtonProps } from '../definitions/buttons.ts';
import { sendsToAssistant, useOpenuiLive } from '../presses.ts';

// OpenUI's Button (plan 06 §6.1, ADR 0124, 6, 14, 18): a press sends its action, or its label when it has none, and only
// while the block is live. Without `onMessage` the button is disabled. Inside a form, a primary button that sends checks
// the form's rules first, as OpenUI's does, and its press carries the form's name.
const component = defineProps<ComponentRenderProps<ButtonProps>>();
const trigger = useTriggerAction();
const live = useOpenuiLive();
const formName = useFormName();
const validation = useFormValidation();
const variants = {
  primary: 'bg-primary text-on-primary',
  secondary: 'border border-line bg-surface text-ink',
  tertiary: 'border border-transparent bg-transparent text-primary',
};
const destructiveVariants = {
  primary: 'bg-danger text-on-primary',
  secondary: 'border border-danger-line bg-surface text-danger',
  tertiary: 'bg-transparent text-danger',
};
const sizes = { 'extra-small': 'px-2 py-0.5 text-xs', small: 'px-2.5 py-1 text-sm', medium: 'px-3 py-1.5 text-sm', large: 'px-4 py-2 text-base' };
const variantClass = computed(() => {
  const variant = component.props.variant ?? 'primary';
  return component.props.type === 'destructive' ? destructiveVariants[variant] : variants[variant];
});

function press(): void {
  if (!live.value) return;
  const action: ActionConfig | undefined = component.props.action;
  const primary = (component.props.variant ?? 'primary') === 'primary';
  if (validation !== null && primary && sendsToAssistant(action) && !validation.validateForm()) return;
  trigger(component.props.label, formName?.value, action);
}
</script>

<template>
  <button
    type="button"
    dir="auto"
    class="m-0 w-fit rounded-lg font-medium disabled:opacity-50"
    :class="[variantClass, sizes[component.props.size ?? 'medium']]"
    :disabled="!live"
    @click="press"
  >
    {{ component.props.label }}
  </button>
</template>

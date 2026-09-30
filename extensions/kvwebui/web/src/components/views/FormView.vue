<script setup lang="ts">
import type { Problem } from '@kvman/sdk';
import { computed, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { problemOf } from '../../api/client.ts';
import { invalidFields } from '../../api/problem-text.ts';
import { applyThen } from '../../composables/then.ts';
import { resolveValues, type Scope } from '../../contributions/references.ts';
import type { View } from '../../contributions/views.ts';
import { commandInputSchema } from '../../forms/command-schema.ts';
import { inputFields } from '../../forms/fields.ts';
import { buildInput, emptyValues } from '../../forms/values.ts';
import { runCommand, showProblem, useKvwebui } from '../../state/kvwebui.ts';
import FormField from './FormField.vue';

// A form from its command's input JSON Schema, minus the `fixed` fields (plan 06 §6.4, ADR 0009, 70–71). A failed
// command shows a toast; `VALIDATION_FAILED` also marks the fields its issues name. The form clears after it succeeds.
const props = defineProps<{ view: Extract<View, { type: 'form' }>; scope: Scope }>();
const state = useKvwebui();
const { t } = useI18n();
const fields = computed(() => inputFields(commandInputSchema(state.extensions.value, props.view.command) ?? {}, Object.keys(props.view.fixed ?? {})));
const values = reactive(emptyValues(fields.value));
const invalid = ref<string[]>([]);
const busy = ref(false);
const localProblem: Problem = { code: 'VALIDATION_FAILED', message: 'Some fields are invalid.' };

const set = (path: string, value: string | boolean): void => {
  values[path] = value;
};

const fail = (problem: Problem): void => {
  const names = fields.value.map((field) => field.name);
  invalid.value = problem.code === 'VALIDATION_FAILED' ? invalidFields(problem).filter((name) => names.includes(name)) : [];
  showProblem(state, problem, invalid.value.length > 0 ? 'kvwebui.form.checkFields' : undefined);
};

const submit = async (): Promise<void> => {
  const built = buildInput(fields.value, values);
  if (built.invalid.length > 0) {
    invalid.value = built.invalid.map((path) => path.split('.')[0] ?? path);
    showProblem(state, localProblem, 'kvwebui.form.checkFields');
    return;
  }
  busy.value = true;
  await runCommand(state, props.view.command, { ...resolveValues(props.view.fixed, props.scope), ...built.input }).then(
    async (output) => {
      Object.assign(values, emptyValues(fields.value));
      invalid.value = [];
      await applyThen(state, props.view.then, output, props.scope);
    },
    (error: unknown) => fail(problemOf(error)),
  );
  busy.value = false;
};
</script>

<template>
  <form class="flex flex-col gap-3.5" novalidate :data-test="`form-${props.view.command}`" @submit.prevent="submit">
    <FormField v-for="field in fields" :key="field.path" :field="field" :command="props.view.command" :values="values" :invalid="invalid" :set="set" />
    <button type="submit" class="h-9 w-fit self-end rounded-xl bg-primary px-3.5 font-medium text-on-primary disabled:opacity-60" :disabled="busy">{{ t(props.view.submit) }}</button>
  </form>
</template>

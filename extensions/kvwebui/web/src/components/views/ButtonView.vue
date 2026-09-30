<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { applyThen } from '../../composables/then.ts';
import { resolveValues, textParams, type Scope } from '../../contributions/references.ts';
import type { ButtonView } from '../../contributions/views.ts';
import { runCommand } from '../../state/commands.ts';
import { showProblem, useKvwebui } from '../../state/kvwebui.ts';

// A button runs its command (plan 06 §6.4), after an in-app confirmation when it has `confirm`; a failure shows a
// toast with the translated Problem (§6.7), and the job's effects apply after either (§6.5).
const props = defineProps<{ view: ButtonView; scope: Scope; small?: boolean }>();
const state = useKvwebui();
const { t } = useI18n();
const busy = ref(false);
const styles = { primary: 'border-primary bg-primary text-on-primary', secondary: 'border-line bg-surface text-ink', danger: 'border-line bg-surface text-danger' };

const click = async (): Promise<void> => {
  if (props.view.confirm !== undefined && !(await state.confirmations.ask(props.view.confirm, {}, props.view.style === 'danger'))) return;
  busy.value = true;
  await runCommand(state, props.view.command, resolveValues(props.view.input, props.scope), (outcome) =>
    outcome.ok ? applyThen(state, props.view.then, outcome.output, props.scope) : showProblem(state, outcome.problem),
  );
  busy.value = false;
};
</script>

<template>
  <button
    type="button"
    class="inline-flex w-fit items-center gap-2 rounded-xl border font-medium disabled:opacity-60"
    :class="[styles[props.view.style ?? 'secondary'], props.small ? 'h-7.5 px-2.5 text-[13px]' : 'h-9 px-3.5']"
    :disabled="busy"
    @click="click"
  >
    {{ t(props.view.text, textParams(props.view.params, props.scope)) }}
  </button>
</template>

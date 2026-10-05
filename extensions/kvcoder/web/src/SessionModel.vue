<script setup lang="ts">
import type { Session } from '../../src/index.ts';
import { toastProblem, useKvman } from './kvman.ts';
import ModelControls from './ModelControls.vue';
import { useModelGroups } from './use-model-groups.ts';
import { useSessionActions } from './use-session-actions.ts';

// The open chat's model and thinking level, in its send box (plan 08 §8.7, ADR 0017, 3): a change runs
// `kvcoder.session.configure` and applies from the next step.
const props = defineProps<{ session: Session }>();
const emit = defineEmits<{ changed: [] }>();
const kvman = useKvman();
const groups = useModelGroups(kvman, () => props.session.model, (error) => toastProblem(kvman, error));
const actions = useSessionActions(kvman, () => props.session.id, () => emit('changed'));
</script>

<template>
  <ModelControls :groups="groups" :model="props.session.model ?? null" :thinking="props.session.thinking" @model="(model) => actions.configure({ model })" @thinking="(thinking) => actions.configure({ thinking })" />
</template>

<script setup lang="ts">
import type { View } from '@kvman/sdk/web';
import { computed, inject, shallowRef } from 'vue';
import { checkView } from '../../contributions/answer.ts';
import { viewScopeKey, type Scope } from '../../contributions/references.ts';
import { useKvwebui } from '../../state/kvwebui.ts';
import ErrorCard from '../shared/ErrorCard.vue';
import ViewNode from './ViewNode.vue';

// `kvman.View` (plan 06 §6.4): renders a custom component's view tree with the built-in components, in the component's
// scope, after checking it like a `ui.get` view (ADR 0009, 83).
const props = defineProps<{ view: View }>();
const state = useKvwebui();
const scope = inject(viewScopeKey, shallowRef<Scope>({}));
const checked = computed(() => checkView(props.view, Object.keys(scope.value.params ?? {}), state.registry.value.known));
</script>

<template>
  <ErrorCard v-if="'problem' in checked" :problem="checked.problem" data-test="view-invalid" />
  <ViewNode v-else :view="checked.view" :scope="scope" />
</template>

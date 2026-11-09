<script setup lang="ts">
import type { View } from '@kvman/sdk/web';
import { computed, inject, provide, shallowRef } from 'vue';
import { checkView } from '../../contributions/answer.ts';
import { viewScopeKey, type Scope } from '../../contributions/references.ts';
import { openuiMessageKey } from '../../openui/presses.ts';
import { useKvwebui } from '../../state/kvwebui.ts';
import ErrorCard from '../shared/ErrorCard.vue';
import ViewNode from './ViewNode.vue';

// `kvman.View` (plan 06 §6.4): renders a custom component's view tree with the built-in components, in the component's
// scope, after checking it like a `ui.get` view (ADR 0009, 83). Its optional `onMessage` makes OpenUI presses live
// (ADR 0124, 18).
const props = defineProps<{ view: View; onMessage?: (text: string) => void }>();
const state = useKvwebui();
const scope = inject(viewScopeKey, shallowRef<Scope>({}));
const checked = computed(() => checkView(props.view, Object.keys(scope.value.params ?? {}), state.registry.value.known));
provide(openuiMessageKey, computed(() => props.onMessage));
</script>

<template>
  <ErrorCard v-if="'problem' in checked" :problem="checked.problem" data-test="view-invalid" />
  <ViewNode v-else :view="checked.view" :scope="scope" />
</template>

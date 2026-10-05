<script setup lang="ts">
import type { Problem } from '@kvman/sdk';
import type { View } from '@kvman/sdk/web';
import { computed, onErrorCaptured, onUnmounted, provide, shallowRef, type Component } from 'vue';
import { useI18n } from 'vue-i18n';
import { problemOf } from '../../api/client.ts';
import { resolveValues, viewScopeKey, type Scope } from '../../contributions/references.ts';
import { componentThrew } from '../../state/components.ts';
import { createKvman } from '../../state/kvman.ts';
import { useKvwebui } from '../../state/kvwebui.ts';
import { useSettingsScope } from '../../state/settings-scope.ts';
import ErrorCard from '../shared/ErrorCard.vue';
import LoadingRows from '../shared/LoadingRows.vue';
import KvmanView from './KvmanView.vue';

// An extension's custom component (plan 06 §6.4): placeholder rows while its module loads, then the component with its
// resolved props and its own injected `kvman`; the error card in its place when it can't load or throws (ADR 0009, 84).
const props = defineProps<{ view: Extract<View, { type: 'custom' }>; scope: Scope }>();
const state = useKvwebui();
const { t } = useI18n();
const handle = createKvman(state, (key, params) => t(key, params ?? {}), KvmanView, useSettingsScope());
provide('kvman', handle.kvman);
provide(
  viewScopeKey,
  computed(() => props.scope),
);
onUnmounted(handle.close);

const loaded = shallowRef<Component>();
const problem = shallowRef<Problem>();
void state.components.load(props.view.component).then(
  (component) => {
    loaded.value = component;
  },
  (error: unknown) => {
    problem.value = problemOf(error);
  },
);
onErrorCaptured((error) => {
  problem.value = componentThrew(props.view.component, error);
  return false;
});
const resolvedProps = computed(() => resolveValues(props.view.props, props.scope));
</script>

<template>
  <ErrorCard v-if="problem" :problem="problem" :data-test="`component-failed-${props.view.component}`" />
  <component :is="loaded" v-else-if="loaded" v-bind="resolvedProps" />
  <LoadingRows v-else />
</template>

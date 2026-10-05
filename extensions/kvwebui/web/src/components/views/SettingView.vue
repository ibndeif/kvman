<script setup lang="ts">
import type { View } from '@kvman/sdk/web';
import { computed } from 'vue';
import { workspaceName } from '../../state/extension-text.ts';
import { useKvwebui } from '../../state/kvwebui.ts';
import { useSettingsScope } from '../../state/settings-scope.ts';
import SettingRow from '../pages/SettingRow.vue';

// `setting { key }` (plan 06 §6.4, ADR 0014, 3): one of the extension's settings as a row, saved into the page's scope.
const props = defineProps<{ view: Extract<View, { type: 'setting' }> }>();
const state = useKvwebui();
const scope = useSettingsScope();
const setting = computed(() => state.settings.value.find((candidate) => candidate.key === props.view.key));
</script>

<template>
  <SettingRow v-if="setting" :setting="setting" :scope="scope" :workspace-name="workspaceName(state)" />
</template>

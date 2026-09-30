<script setup lang="ts">
import type { Problem } from '@kvman/sdk';
import { Lock } from '@lucide/vue';
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { SettingInfo } from '../../api/kernel.ts';
import { invalidFields } from '../../api/problem-text.ts';
import { valueField } from '../../forms/fields.ts';
import { buildInput, valueText, type FormValues } from '../../forms/values.ts';
import { applyLanguage, applyTheme } from '../../state/appearance.ts';
import { useI18nState } from '../../state/i18n.ts';
import { runCommand } from '../../state/commands.ts';
import { settingValue, showProblem, useKvwebui } from '../../state/kvwebui.ts';
import { reloadSettings } from '../../state/workspaces.ts';
import FormField from '../views/FormField.vue';

// One setting (ADR 0009, 77): its title, description, and key; a control from its schema with the scope it applies
// to; where its value comes from; and a reset. A preset-only key is shown locked.
const props = defineProps<{ setting: SettingInfo }>();
const state = useKvwebui();
const i18n = useI18nState();
const { t, te } = useI18n();
const field = computed(() => valueField(props.setting.schema));
const values = reactive<FormValues>({});
const scope = ref<'global' | 'workspace'>('global');
const invalid = ref<string[]>([]);
const reset = (): void => {
  values['value'] = valueText(field.value, props.setting.value);
  scope.value = props.setting.source === 'workspace' ? 'workspace' : 'global';
  invalid.value = [];
};
watch(() => props.setting, reset, { immediate: true });

const title = computed(() => (te(`${props.setting.key}.title`) ? t(`${props.setting.key}.title`) : props.setting.key));
const description = computed(() => (te(`${props.setting.key}.description`) ? t(`${props.setting.key}.description`) : props.setting.description));
const locked = computed(() => props.setting.scopes.length === 0);
const sourceText = computed(() => (props.setting.source === 'preset' ? t('kvwebui.settings.fromPreset', { preset: state.health.value?.preset ?? '' }) : t(`kvwebui.settings.source.${props.setting.source}`)));
const changed = computed(() => values['value'] !== valueText(field.value, props.setting.value) || (props.setting.source !== scope.value && props.setting.source !== 'default' && props.setting.source !== 'preset'));
const resettable = computed(() => props.setting.source === scope.value);

const saved = async (): Promise<void> => {
  await reloadSettings(state);
  if (props.setting.key === 'kvwebui.theme') applyTheme(state);
  const language = props.setting.key === 'kernel.language' ? settingValue(state, 'kernel.language') : undefined;
  if (typeof language === 'string' && language !== state.language.value) await applyLanguage(state, i18n, language);
};
const fail = (problem: Problem): void => {
  invalid.value = problem.code === 'VALIDATION_FAILED' && invalidFields(problem).length > 0 ? ['value'] : [];
  showProblem(state, problem);
};
const save = async (): Promise<void> => {
  const built = buildInput([field.value], values);
  const value = built.input['value'];
  if (built.invalid.length > 0 || value === undefined) {
    invalid.value = ['value'];
    return;
  }
  await runCommand(state, 'kernel.settings.set', { key: props.setting.key, value, scope: scope.value }, (outcome) => (outcome.ok ? saved() : fail(outcome.problem)));
};
const resetValue = async (): Promise<void> => {
  await runCommand(state, 'kernel.settings.reset', { key: props.setting.key, scope: scope.value }, (outcome) => (outcome.ok ? saved() : fail(outcome.problem)));
};
const set = (path: string, value: string | boolean): void => {
  values[path] = value;
};
</script>

<template>
  <div class="flex flex-wrap items-start gap-6 border-b border-line-soft px-5 py-4 last:border-b-0" :data-test="`setting-${props.setting.key}`">
    <div class="flex min-w-60 grow basis-80 flex-col gap-0.5">
      <span class="font-semibold" data-test="setting-title">{{ title }}</span>
      <span class="text-muted" data-test="setting-description">{{ description }}</span>
      <span class="font-mono text-xs text-muted">{{ props.setting.key }}</span>
    </div>
    <div class="flex w-90 max-w-full flex-col gap-2">
      <template v-if="locked">
        <div class="flex h-9.5 items-center gap-2 rounded-xl bg-neutral-soft px-3 text-neutral-ink" data-test="setting-locked">
          <Lock class="size-4 shrink-0" aria-hidden="true" /><span class="truncate font-mono text-[13px]">{{ valueText(field, props.setting.value) }}</span>
        </div>
        <span class="text-[12.5px] text-muted">{{ sourceText }}</span>
      </template>
      <template v-else>
        <FormField :field="field" command="kvwebui.settings" :values="values" :invalid="invalid" :set="set" bare />
        <div v-if="props.setting.scopes.length === 2" role="group" :aria-label="t('kvwebui.settings.appliesTo')" class="flex gap-0.5 rounded-xl bg-neutral-soft p-0.75">
          <button
            v-for="choice in (['global', 'workspace'] as const)"
            :key="choice"
            type="button"
            class="h-7.5 grow rounded-lg text-[13px]"
            :class="scope === choice ? 'bg-surface font-medium text-ink shadow-sm' : 'text-neutral-ink'"
            :aria-pressed="scope === choice"
            :data-test="`scope-${choice}`"
            @click="scope = choice"
          >
            {{ t(`kvwebui.settings.scope.${choice}`) }}
          </button>
        </div>
        <div class="flex flex-wrap items-center gap-2.5">
          <span class="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent-ink" data-test="setting-source">{{ sourceText }}</span>
          <button v-if="resettable" type="button" class="text-[13px] font-medium text-primary" data-test="setting-reset" @click="resetValue">{{ t(`kvwebui.settings.reset.${scope}`) }}</button>
          <div class="grow" />
          <button v-if="changed" type="button" class="h-8 rounded-lg bg-primary px-3 text-[13px] font-medium text-on-primary" data-test="setting-save" @click="save">{{ t('kvwebui.settings.save') }}</button>
        </div>
      </template>
    </div>
  </div>
</template>

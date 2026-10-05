<script setup lang="ts">
import { Check, Lock } from '@lucide/vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { SettingInfo } from '../../api/kernel.ts';
import { valueText } from '../../forms/values.ts';
import { useI18nState } from '../../state/i18n.ts';
import { useKvwebui } from '../../state/kvwebui.ts';
import { useSettingSave, type Scope } from '../../state/setting-save.ts';
import { settingDescription, settingTitle } from '../../state/setting-text.ts';
import SettingControl from './SettingControl.vue';

// One setting (ADR 0009, 77; ADR 0013, 2 to 5): its title and description, a control that saves as it changes into the
// page's scope, whether the value was changed there, and a reset. Its key and where the value comes from are in its
// details. A preset-only key is shown locked, and a key this workspace overrides can't be edited for all workspaces.
const props = defineProps<{ setting: SettingInfo; scope: Scope; workspaceName: string }>();
const state = useKvwebui();
const translator = useI18n();
const { t } = translator;
const target = computed<Scope>(() => (props.setting.scopes.includes(props.scope) ? props.scope : 'global'));
const save = useSettingSave(state, useI18nState(), () => props.setting, () => target.value);
const { field, typed, invalid, issue, saved } = save;

const title = computed(() => settingTitle(translator, props.setting));
const description = computed(() => settingDescription(translator, props.setting));
const locked = computed(() => props.setting.scopes.length === 0);
const ownValue = computed(() => target.value === 'global' && props.setting.source === 'workspace');
const globalOnly = computed(() => props.scope === 'workspace' && !props.setting.scopes.includes('workspace'));
const presetText = computed(() => t('kvwebui.settings.fromPreset', { preset: state.health.value?.preset ?? '' }));
const sourceText = computed(() => (props.setting.source === 'preset' ? presetText.value : t(`kvwebui.settings.source.${props.setting.source}`)));
</script>

<template>
  <div class="flex flex-wrap items-start gap-6 border-b border-line-soft px-5 py-4 last:border-b-0" :data-test="`setting-${props.setting.key}`">
    <div class="flex min-w-60 grow basis-80 flex-col gap-1">
      <span class="font-semibold" data-test="setting-title">{{ title }}</span>
      <span class="text-muted" data-test="setting-description">{{ description }}</span>
      <details class="text-[12.5px] text-muted" data-test="setting-details">
        <summary class="w-fit">{{ t('kvwebui.settings.details') }}</summary>
        <span class="flex flex-wrap items-center gap-x-2 pt-1">
          <span dir="ltr" class="font-mono text-xs" data-test="setting-key">{{ props.setting.key }}</span>
          <span data-test="setting-source">{{ sourceText }}</span>
        </span>
      </details>
    </div>
    <div class="flex w-90 max-w-full flex-col gap-2">
      <template v-if="locked">
        <div class="flex h-9.5 items-center gap-2 rounded-xl bg-neutral-soft px-3 text-neutral-ink" data-test="setting-locked">
          <Lock class="size-4 shrink-0" aria-hidden="true" /><span dir="ltr" class="truncate font-mono text-[13px]">{{ valueText(field, props.setting.value) }}</span>
        </div>
        <span class="text-[12.5px] text-muted">{{ sourceText }}</span>
      </template>
      <template v-else>
        <SettingControl :field="field" :setting-key="props.setting.key" :value="typed" :invalid="invalid" :disabled="ownValue" :label="title" @input="save.edit" @commit="save.commit" />
        <span v-if="issue" class="text-[12.5px] text-danger" data-test="setting-issue">{{ issue }}</span>
        <span v-if="ownValue" class="text-[12.5px] text-muted" data-test="setting-own-value">{{ t('kvwebui.settings.ownValue', { name: props.workspaceName }) }}</span>
        <div v-else class="flex min-h-5 flex-wrap items-center gap-x-2.5 gap-y-1 text-[12.5px]">
          <span v-if="globalOnly" class="text-muted" data-test="setting-global-only">{{ t('kvwebui.settings.globalOnly') }}</span>
          <template v-if="props.setting.source === target">
            <span class="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent-ink" data-test="setting-changed">{{ t(`kvwebui.settings.changed.${target}`, { name: props.workspaceName }) }}</span>
            <button type="button" class="text-[13px] font-medium text-primary" data-test="setting-reset" @click="save.reset">{{ t(`kvwebui.settings.reset.${target}`) }}</button>
          </template>
          <span v-if="props.setting.source === 'preset'" class="text-muted" data-test="setting-preset">{{ presetText }}</span>
          <span class="grow" />
          <span v-if="saved" role="status" class="flex items-center gap-1 font-medium text-success-ink" data-test="setting-saved"><Check class="size-3.5" aria-hidden="true" />{{ t('kvwebui.settings.saved') }}</span>
        </div>
      </template>
    </div>
  </div>
</template>

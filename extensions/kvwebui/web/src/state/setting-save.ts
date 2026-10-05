import { computed, onBeforeUnmount, ref, watch, type ComputedRef, type Ref } from 'vue';
import type { SettingInfo } from '../api/kernel.ts';
import { firstIssueMessage } from '../api/problem-text.ts';
import { valueField, type Field } from '../forms/fields.ts';
import { buildInput, valueText } from '../forms/values.ts';
import { applyLanguage, applyTheme } from './appearance.ts';
import { runCommand, type CommandOutcome } from './commands.ts';
import type { I18nState } from './i18n.ts';
import { settingValue, showProblem, type Kvwebui } from './kvwebui.ts';
import { reloadSettings } from './workspaces.ts';

// Saving one setting as it changes (ADR 0013, 3): a value equal to the one in effect isn't sent, a saved row says so
// for 3 seconds, and a value kvman rejects stays in its field with the first issue under it and no toast.

export const savedMilliseconds = 3000;

export type Scope = 'global' | 'workspace';

export type SettingSave = {
  field: ComputedRef<Field>;
  typed: Ref<string | boolean>;
  invalid: Ref<boolean>;
  issue: Ref<string | undefined>;
  saved: Ref<boolean>;
  edit(value: string | boolean): void;
  commit(): Promise<void>;
  reset(): Promise<void>;
};

export function useSettingSave(state: Kvwebui, i18n: I18nState, setting: () => SettingInfo, target: () => Scope): SettingSave {
  const field = computed(() => valueField(setting().schema));
  const typed = ref<string | boolean>('');
  const invalid = ref(false);
  const issue = ref<string | undefined>(undefined);
  const saved = ref(false);
  let savedTimer: ReturnType<typeof setTimeout> | undefined;

  // After a reload the field takes the value in effect, unless it holds a value the person still has to correct.
  watch(setting, (current) => {
    if (!invalid.value) typed.value = valueText(field.value, current.value);
  }, { immediate: true });
  onBeforeUnmount(() => clearTimeout(savedTimer));

  const accepted = async (): Promise<void> => {
    invalid.value = false;
    issue.value = undefined;
    await reloadSettings(state);
    const { key } = setting();
    if (key === 'kvwebui.theme') applyTheme(state);
    const language = key === 'kernel.language' ? settingValue(state, 'kernel.language') : undefined;
    if (typeof language === 'string' && language !== state.language.value) await applyLanguage(state, i18n, language);
    clearTimeout(savedTimer);
    saved.value = true;
    savedTimer = setTimeout(() => (saved.value = false), savedMilliseconds);
  };

  const ended = (outcome: CommandOutcome): void | Promise<void> => {
    if (outcome.ok) return accepted();
    if (outcome.problem.code !== 'VALIDATION_FAILED') return showProblem(state, outcome.problem);
    invalid.value = true;
    issue.value = firstIssueMessage(outcome.problem);
  };

  return {
    field,
    typed,
    invalid,
    issue,
    saved,
    edit: (value) => {
      typed.value = value;
      saved.value = false;
    },
    commit: async () => {
      const built = buildInput([field.value], { value: typed.value });
      const value = built.input['value'];
      issue.value = undefined;
      invalid.value = built.invalid.length > 0 || value === undefined;
      if (invalid.value || JSON.stringify(value) === JSON.stringify(setting().value)) return;
      await runCommand(state, 'kernel.settings.set', { key: setting().key, value, scope: target() }, ended);
    },
    reset: async () => {
      invalid.value = false;
      await runCommand(state, 'kernel.settings.reset', { key: setting().key, scope: target() }, ended);
    },
  };
}

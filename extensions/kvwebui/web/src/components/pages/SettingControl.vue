<script setup lang="ts">
import { CircleAlert } from '@lucide/vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { Field } from '../../forms/fields.ts';
import { languageName } from '../../state/appearance.ts';
import { useKvwebui } from '../../state/kvwebui.ts';

// One setting's control (ADR 0013, 3 and 4), built from its schema. A select or a checkbox says `commit` as it changes,
// and a field on Enter or when the person leaves it. A string option is named `<key>.options.<value>`, and
// `kernel.language` lists the installed languages, each named in itself.
const props = defineProps<{ field: Field; settingKey: string; value: string | boolean; invalid: boolean; disabled: boolean; label: string }>();
const emit = defineEmits<{ input: [value: string | boolean]; commit: [] }>();
const state = useKvwebui();
const { t, te } = useI18n();
const text = computed(() => (typeof props.value === 'string' ? props.value : ''));
const isLanguage = computed(() => props.settingKey === 'kernel.language');
const controlClass = computed(() => ['w-full rounded-xl border bg-surface px-3 disabled:opacity-60', props.invalid ? 'border-danger ring-3 ring-danger-soft' : 'border-line']);
const optionText = (option: unknown): string => {
  if (typeof option !== 'string') return JSON.stringify(option);
  const key = `${props.settingKey}.options.${option}`;
  return te(key) ? t(key) : option;
};
const typed = (event: Event): void => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) emit('input', event.target.value);
};
const picked = (event: Event): void => {
  typed(event);
  emit('commit');
};
const checked = (event: Event): void => {
  if (!(event.target instanceof HTMLInputElement)) return;
  emit('input', event.target.checked);
  emit('commit');
};
</script>

<template>
  <div class="flex flex-col gap-1.5" data-test="setting-control">
    <select v-if="isLanguage" :class="controlClass" class="h-10" :value="text" :disabled="props.disabled" :aria-label="props.label" @change="picked">
      <option v-for="language in state.health.value?.languages ?? []" :key="language" :value="language" :lang="language">{{ languageName(language) }}</option>
    </select>
    <select v-else-if="props.field.kind === 'select'" :class="controlClass" class="h-10" :value="text" :disabled="props.disabled" :aria-label="props.label" @change="picked">
      <option v-if="props.field.nullable" value="">{{ t('kvwebui.form.none') }}</option>
      <option v-for="option in props.field.options ?? []" :key="JSON.stringify(option)" :value="JSON.stringify(option)">{{ optionText(option) }}</option>
    </select>
    <input v-else-if="props.field.kind === 'checkbox'" type="checkbox" class="size-4 accent-primary" :checked="props.value === true" :disabled="props.disabled" :aria-label="props.label" @change="checked" />
    <textarea
      v-else-if="props.field.kind === 'lines' || props.field.kind === 'json'"
      dir="ltr"
      :class="controlClass"
      class="min-h-20 py-2 font-mono text-[13px]"
      :value="text"
      :disabled="props.disabled"
      :aria-label="props.label"
      @input="typed"
      @change="emit('commit')"
    />
    <input
      v-else
      :type="props.field.kind === 'password' ? 'password' : props.field.kind === 'number' ? 'number' : 'text'"
      :autocomplete="props.field.kind === 'password' ? 'off' : undefined"
      :dir="props.field.kind === 'text' ? 'auto' : undefined"
      :class="controlClass"
      class="h-10"
      :value="text"
      :disabled="props.disabled"
      :aria-label="props.label"
      @input="typed"
      @change="emit('commit')"
      @keydown.enter="emit('commit')"
    />
    <span v-if="props.field.kind === 'lines'" class="text-xs text-muted">{{ t('kvwebui.form.onePerLine') }}</span>
    <span v-if="props.invalid" class="flex items-center gap-1.5 text-[12.5px] text-danger" data-test="field-invalid"><CircleAlert class="size-3.5" aria-hidden="true" />{{ t('kvwebui.form.invalid') }}</span>
  </div>
</template>

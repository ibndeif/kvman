<script setup lang="ts">
import { Plus, X } from '@lucide/vue';
import { computed, reactive, ref } from 'vue';
import { useKvman } from './kvman.ts';
import { draftOf, draftProblems, entryOf, kindOf, secretChanges, type DraftField, type McpServerEntry } from './mcp-server-entry.ts';
import type { SecretChanges } from './use-mcp-servers.ts';

// The form that adds or edits one MCP server (plan 08 §8.7, ADR 0020, 6 and 15). A variable's or header's value is
// typed into a password field and never read back: one that is stored shows "Set", with Replace.
const props = defineProps<{ entry?: McpServerEntry; taken: readonly string[]; secrets: readonly string[]; working: boolean }>();
const emit = defineEmits<{ save: [entry: McpServerEntry, changes: SecretChanges]; cancel: [] }>();
const kvman = useKvman();
const draft = reactive(draftOf(props.entry, props.secrets));
const problems = ref<Partial<Record<DraftField, string>>>({});
const kind = computed(() => kindOf(draft));
const text = (key: string): string => kvman.t(`kvcoder.config.mcp.form.${key}`);

// A server's name is fixed once it is saved: its secrets are kept under it.
const editing = props.entry !== undefined;

function submit(): void {
  problems.value = draftProblems(draft, props.taken);
  if (Object.keys(problems.value).length > 0) return;
  emit('save', entryOf(draft), secretChanges(draft, props.entry, props.secrets));
}

// The other kind's names would be stored as this kind's, so a switch starts the list again.
function runAs(next: 'command' | 'url'): void {
  if (draft.kind === next) return;
  draft.kind = next;
  draft.values = [];
}
</script>

<template>
  <form class="kvc-form" novalidate data-test="mcp-form" @submit.prevent="submit">
    <span class="kvc-setting-title" data-test="mcp-form-title">{{ editing ? kvman.t('kvcoder.config.mcp.form.titleEdit', { name: draft.name }) : text('titleNew') }}</span>
    <label class="kvc-form-field">
      <span class="kvc-form-label">{{ text('name') }}</span>
      <input v-model="draft.name" type="text" dir="ltr" class="kvc-field kvc-mono" :disabled="editing" spellcheck="false" autocomplete="off" :aria-invalid="problems.name !== undefined" data-test="mcp-name" />
      <span v-if="problems.name !== undefined" class="kvc-form-error" role="alert" data-test="mcp-name-error">{{ kvman.t(problems.name) }}</span>
      <span v-else class="kvc-muted">{{ text('nameHint') }}</span>
    </label>
    <label class="kvc-form-field">
      <span class="kvc-form-label">{{ text('description') }}</span>
      <input v-model="draft.description" type="text" dir="auto" class="kvc-field" autocomplete="off" :aria-invalid="problems.description !== undefined" data-test="mcp-description" />
      <span v-if="problems.description !== undefined" class="kvc-form-error" role="alert" data-test="mcp-description-error">{{ kvman.t(problems.description) }}</span>
      <span v-else class="kvc-muted">{{ text('descriptionHint') }}</span>
    </label>
    <fieldset class="kvc-form-choice">
      <legend class="kvc-form-label">{{ text('kind') }}</legend>
      <label v-for="choice in ['command', 'url'] as const" :key="choice" class="kvc-form-radio">
        <input type="radio" name="kvc-mcp-kind" :value="choice" :checked="draft.kind === choice" :data-test="`mcp-kind-${choice}`" @change="runAs(choice)" />
        {{ text(`kind.${choice}`) }}
      </label>
    </fieldset>
    <template v-if="draft.kind === 'command'">
      <label class="kvc-form-field">
        <span class="kvc-form-label">{{ text('command') }}</span>
        <input v-model="draft.command" type="text" dir="ltr" class="kvc-field kvc-mono" spellcheck="false" autocomplete="off" :aria-invalid="problems.command !== undefined" data-test="mcp-command" />
        <span v-if="problems.command !== undefined" class="kvc-form-error" role="alert" data-test="mcp-command-error">{{ kvman.t(problems.command) }}</span>
        <span v-else class="kvc-muted">{{ text('commandHint') }}</span>
      </label>
      <label class="kvc-form-field">
        <span class="kvc-form-label">{{ text('args') }}</span>
        <textarea v-model="draft.args" dir="ltr" rows="3" class="kvc-field kvc-mono" spellcheck="false" data-test="mcp-args" />
        <span class="kvc-muted">{{ text('argsHint') }}</span>
      </label>
    </template>
    <label v-else class="kvc-form-field">
      <span class="kvc-form-label">{{ text('url') }}</span>
      <input v-model="draft.url" type="url" dir="ltr" class="kvc-field kvc-mono" spellcheck="false" autocomplete="off" placeholder="https://" :aria-invalid="problems.url !== undefined" data-test="mcp-url" />
      <span v-if="problems.url !== undefined" class="kvc-form-error" role="alert" data-test="mcp-url-error">{{ kvman.t(problems.url) }}</span>
    </label>
    <div class="kvc-form-field" data-test="mcp-values">
      <span class="kvc-form-label">{{ text(kind) }}</span>
      <span class="kvc-muted">{{ text('secretsHint') }}</span>
      <div v-for="(value, index) in draft.values" :key="index" class="kvc-form-value" data-test="mcp-value">
        <input v-model="value.name" type="text" dir="ltr" class="kvc-field kvc-mono" :disabled="value.set" :placeholder="text(`valueName.${kind}`)" :aria-label="text(`valueName.${kind}`)" spellcheck="false" autocomplete="off" data-test="mcp-value-name" />
        <span v-if="value.set && !value.replacing" class="kvc-form-set">
          <span class="kvc-chip" data-test="mcp-value-set">{{ text('set') }}</span>
          <button type="button" class="kvc-text-button" data-test="mcp-value-replace" @click="value.replacing = true">{{ text('replace') }}</button>
        </span>
        <input v-else v-model="value.value" type="password" autocomplete="off" class="kvc-field" :placeholder="text('value')" :aria-label="kvman.t('kvcoder.config.mcp.form.valueOf', { name: value.name })" data-test="mcp-value-secret" />
        <button type="button" class="kvc-button kvc-ghost kvc-icon-button" :aria-label="kvman.t('kvcoder.config.mcp.form.removeValue', { name: value.name })" data-test="mcp-value-remove" @click="draft.values.splice(index, 1)">
          <X :size="16" aria-hidden="true" />
        </button>
      </div>
      <span v-if="problems.values !== undefined" class="kvc-form-error" role="alert" data-test="mcp-values-error">{{ kvman.t(problems.values) }}</span>
      <button type="button" class="kvc-text-button kvc-form-add" data-test="mcp-value-add" @click="draft.values.push({ name: '', value: '', set: false, replacing: false })"><Plus :size="14" aria-hidden="true" />{{ text(`add.${kind}`) }}</button>
    </div>
    <div class="kvc-actions">
      <button type="button" class="kvc-button" :disabled="props.working" data-test="mcp-cancel" @click="emit('cancel')">{{ kvman.t('kvcoder.config.mcp.cancel') }}</button>
      <button type="submit" class="kvc-button kvc-primary" :disabled="props.working" data-test="mcp-save">{{ text('save') }}</button>
    </div>
  </form>
</template>

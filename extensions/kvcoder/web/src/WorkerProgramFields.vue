<script setup lang="ts">
import { useKvman } from './kvman.ts';
import { claudeEffort, permissionModes, piThinking, type WorkerDraft } from './worker-entry.ts';

// What a program worker sets (plan 08 §8.7, ADR 0021, 12, 13, and 38): whether a run asks first, its time limit, and
// the flags of its kind, each left empty for the program's own default.
// The form's own draft, edited in place.
const draft = defineModel<WorkerDraft>('draft', { required: true });
const props = defineProps<{ minutesProblem?: string | undefined }>();
const kvman = useKvman();
const text = (key: string): string => kvman.t(`kvcoder.config.workers.form.${key}`);
</script>

<template>
  <fieldset class="kvc-form-choice">
    <legend class="kvc-form-label">{{ text('approval') }}</legend>
    <label v-for="choice in ['ask', 'auto'] as const" :key="choice" class="kvc-form-radio">
      <input v-model="draft.approval" type="radio" name="kvc-worker-approval" :value="choice" :data-test="`worker-approval-${choice}`" />
      {{ text(`approval.${choice}`) }}
    </label>
    <span class="kvc-muted">{{ text('approvalHint') }}</span>
  </fieldset>
  <label class="kvc-form-field">
    <span class="kvc-form-label">{{ text('minutes') }}</span>
    <input v-model="draft.minutes" type="text" inputmode="numeric" dir="ltr" class="kvc-field kvc-mono" autocomplete="off" :aria-invalid="props.minutesProblem !== undefined" data-test="worker-minutes" />
    <span v-if="props.minutesProblem !== undefined" class="kvc-form-error" role="alert" data-test="worker-minutes-error">{{ kvman.t(props.minutesProblem) }}</span>
    <span v-else class="kvc-muted">{{ text('minutesHint') }}</span>
  </label>
  <label class="kvc-form-field">
    <span class="kvc-form-label">{{ text('model') }}</span>
    <input v-model="draft.programModel" type="text" dir="ltr" class="kvc-field kvc-mono" spellcheck="false" autocomplete="off" data-test="worker-program-model" />
    <span class="kvc-muted">{{ text('programDefault') }}</span>
  </label>
  <template v-if="draft.kind === 'opencode'">
    <label class="kvc-form-field">
      <span class="kvc-form-label">{{ text('agent') }}</span>
      <input v-model="draft.agent" type="text" dir="ltr" class="kvc-field kvc-mono" spellcheck="false" autocomplete="off" data-test="worker-agent" />
      <span class="kvc-muted">{{ text('programDefault') }}</span>
    </label>
    <label class="kvc-form-radio">
      <input v-model="draft.autoApprove" type="checkbox" data-test="worker-auto-approve" />
      {{ text('autoApprove') }}
    </label>
  </template>
  <template v-else-if="draft.kind === 'pi'">
    <label class="kvc-form-field">
      <span class="kvc-form-label">{{ text('thinking') }}</span>
      <select v-model="draft.piThinking" class="kvc-button" data-test="worker-pi-thinking">
        <option value="">{{ text('programDefault') }}</option>
        <option v-for="level in piThinking" :key="level" :value="level">{{ level }}</option>
      </select>
    </label>
    <label class="kvc-form-field">
      <span class="kvc-form-label">{{ text('tools') }}</span>
      <textarea v-model="draft.tools" dir="ltr" rows="3" class="kvc-field kvc-mono" spellcheck="false" data-test="worker-tools" />
      <span class="kvc-muted">{{ text('toolsHint') }}</span>
    </label>
  </template>
  <template v-else>
    <label class="kvc-form-field">
      <span class="kvc-form-label">{{ text('effort') }}</span>
      <select v-model="draft.effort" class="kvc-button" data-test="worker-effort">
        <option value="">{{ text('programDefault') }}</option>
        <option v-for="level in claudeEffort" :key="level" :value="level">{{ level }}</option>
      </select>
    </label>
    <label class="kvc-form-field">
      <span class="kvc-form-label">{{ text('permissionMode') }}</span>
      <select v-model="draft.permissionMode" class="kvc-button" data-test="worker-permission-mode">
        <option v-for="mode in permissionModes" :key="mode" :value="mode">{{ mode }}</option>
      </select>
      <span class="kvc-muted">{{ text('permissionModeHint') }}</span>
    </label>
  </template>
</template>

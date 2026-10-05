<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { toastProblem, useKvman } from './kvman.ts';
import { modelGroups, thinkingLevels, type ModelRow, type ProviderRow } from './model-groups.ts';
import ModelPicker from './ModelPicker.vue';
import { ownConnectors } from './use-connectors.ts';
import { draftOf, draftProblems, entryOf, workerKinds, type DraftField, type WorkerEntry } from './worker-entry.ts';
import WorkerProgramFields from './WorkerProgramFields.vue';

// The form that adds or edits one worker (plan 08 §8.7, ADR 0021, 7, 20, and 38): its kind and instructions, then a
// subagent's connectors, model, and thinking, each of which may be left as the chat's own, or a program's own fields.
const props = defineProps<{ entry?: WorkerEntry; taken: readonly string[]; working: boolean }>();
const emit = defineEmits<{ save: [entry: WorkerEntry]; cancel: [] }>();
const kvman = useKvman();
const draft = reactive(draftOf(props.entry));
const problems = ref<Partial<Record<DraftField, string>>>({});
const providers = ref<ProviderRow[]>([]);
const models = ref<ModelRow[]>([]);
const added = ref<string[]>([]);
const text = (key: string): string => kvman.t(`kvcoder.config.workers.form.${key}`);

// A worker's name and kind are fixed once it is saved: the agent calls it by that name.
const editing = props.entry !== undefined;

// A subagent never has `delegate` (ADR 0021, 24), so it isn't offered.
const offered = computed(() => [...ownConnectors.filter((name) => name !== 'delegate'), ...added.value]);
const groups = computed(() => modelGroups(providers.value, models.value, draft.model));

onMounted(async () => {
  try {
    const [providerRows, modelRows, connectors] = await Promise.all([kvman.exec('kvai.provider.list', {}), kvman.exec('kvai.model.list', {}), kvman.exec('kvcoder.connector.list', {})]);
    providers.value = providerRows;
    models.value = modelRows;
    added.value = connectors.map((connector) => connector.name);
  } catch (error) {
    toastProblem(kvman, error);
  }
});

function tick(name: string, event: Event): void {
  const on = event.target instanceof HTMLInputElement && event.target.checked;
  draft.connectors = on ? [...draft.connectors, name] : draft.connectors.filter((other) => other !== name);
}

function submit(): void {
  problems.value = draftProblems(draft, props.taken);
  if (Object.keys(problems.value).length > 0) return;
  emit('save', entryOf(draft, offered.value));
}
</script>

<template>
  <form class="kvc-form" novalidate data-test="worker-form" @submit.prevent="submit">
    <span class="kvc-setting-title" data-test="worker-form-title">{{ editing ? kvman.t('kvcoder.config.workers.form.titleEdit', { name: draft.name }) : text('titleNew') }}</span>
    <label class="kvc-form-field">
      <span class="kvc-form-label">{{ text('name') }}</span>
      <input v-model="draft.name" type="text" dir="ltr" class="kvc-field kvc-mono" :disabled="editing" spellcheck="false" autocomplete="off" :aria-invalid="problems.name !== undefined" data-test="worker-name" />
      <span v-if="problems.name !== undefined" class="kvc-form-error" role="alert" data-test="worker-name-error">{{ kvman.t(problems.name) }}</span>
      <span v-else class="kvc-muted">{{ text('nameHint') }}</span>
    </label>
    <label class="kvc-form-field">
      <span class="kvc-form-label">{{ text('description') }}</span>
      <input v-model="draft.description" type="text" dir="auto" class="kvc-field" autocomplete="off" :aria-invalid="problems.description !== undefined" data-test="worker-description" />
      <span v-if="problems.description !== undefined" class="kvc-form-error" role="alert" data-test="worker-description-error">{{ kvman.t(problems.description) }}</span>
      <span v-else class="kvc-muted">{{ text('descriptionHint') }}</span>
    </label>
    <label class="kvc-form-field">
      <span class="kvc-form-label">{{ text('kind') }}</span>
      <select v-model="draft.kind" class="kvc-button" :disabled="editing" data-test="worker-kind-select">
        <option v-for="kind in workerKinds" :key="kind" :value="kind">{{ kvman.t(`kvcoder.config.workers.kind.${kind}`) }}</option>
      </select>
      <span class="kvc-muted">{{ text('kindHint') }}</span>
    </label>
    <label class="kvc-form-field">
      <span class="kvc-form-label">{{ text('instructions') }}</span>
      <textarea v-model="draft.instructions" dir="auto" rows="8" class="kvc-field" :aria-invalid="problems.instructions !== undefined" data-test="worker-instructions" />
      <span v-if="problems.instructions !== undefined" class="kvc-form-error" role="alert" data-test="worker-instructions-error">{{ kvman.t(problems.instructions) }}</span>
      <span v-else class="kvc-muted">{{ text('instructionsHint') }}</span>
    </label>
    <WorkerProgramFields v-if="draft.kind !== 'subagent'" v-model:draft="draft" :minutes-problem="problems.minutes" />
    <template v-else>
    <fieldset class="kvc-form-choice">
      <legend class="kvc-form-label">{{ text('connectors') }}</legend>
      <label class="kvc-form-radio">
        <input type="radio" name="kvc-worker-connectors" :checked="draft.all" data-test="worker-connectors-all" @change="draft.all = true" />
        {{ text('connectors.all') }}
      </label>
      <label class="kvc-form-radio">
        <input type="radio" name="kvc-worker-connectors" :checked="!draft.all" data-test="worker-connectors-some" @change="draft.all = false" />
        {{ text('connectors.some') }}
      </label>
      <template v-if="!draft.all">
        <label v-for="name in offered" :key="name" class="kvc-form-radio kvc-mono">
          <input type="checkbox" :checked="draft.connectors.includes(name)" :data-test="`worker-connector-${name}`" @change="tick(name, $event)" />
          {{ name }}
        </label>
      </template>
      <span v-if="problems.connectors !== undefined" class="kvc-form-error" role="alert" data-test="worker-connectors-error">{{ kvman.t(problems.connectors) }}</span>
      <span v-else class="kvc-muted">{{ text('connectorsHint') }}</span>
    </fieldset>
    <div class="kvc-form-field" data-test="worker-model">
      <span class="kvc-form-label">{{ text('model') }}</span>
      <ModelPicker :groups="groups" :current="draft.model" :empty="text('sameModel')" :none="text('sameModel')" @pick="(modelId) => (draft.model = modelId)" @none="draft.model = null" />
    </div>
    <label class="kvc-form-field">
      <span class="kvc-form-label">{{ text('thinking') }}</span>
      <select v-model="draft.thinking" class="kvc-button" data-test="worker-thinking">
        <option value="">{{ text('sameThinking') }}</option>
        <option v-for="level in thinkingLevels" :key="level" :value="level">{{ kvman.t(`kvcoder.ui.thinkingLevels.${level}`) }}</option>
      </select>
    </label>
    </template>
    <div class="kvc-actions">
      <button type="button" class="kvc-button" :disabled="props.working" data-test="worker-cancel" @click="emit('cancel')">{{ kvman.t('kvcoder.config.workers.cancel') }}</button>
      <button type="submit" class="kvc-button kvc-primary" :disabled="props.working" data-test="worker-save">{{ text('save') }}</button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { Pencil, Plus, Trash2 } from '@lucide/vue';
import { ref } from 'vue';
import { useKvman } from './kvman.ts';
import { useWorkers } from './use-workers.ts';
import type { WorkerEntry } from './worker-entry.ts';
import WorkerForm from './WorkerForm.vue';

// The `delegate` connector's configuration (plan 08 §8.7, ADR 0021, 6, 30, and 38): the workers, each with a switch
// and, for a program, whether it was found, and the form that adds or edits one. The list is saved into the scope the extension's page is set to.
const kvman = useKvman();
const { workers, states, locked, changed, working, save, remove, toggle, reset, check } = useWorkers(kvman);
const form = ref<{ entry?: WorkerEntry }>();
const removing = ref<string>();
const scoped = (key: string): string => kvman.t(`${key}.${kvman.scope.value}`, { name: kvman.workspace.value.name });
const named = (key: string, name: string): string => kvman.t(`kvcoder.config.workers.${key}`, { name });

async function saved(entry: WorkerEntry): Promise<void> {
  if (!(await save(entry))) return;
  form.value = undefined;
  kvman.toast('kvcoder.config.workers.saved', { name: entry.name }, 'success');
}

async function removed(name: string): Promise<void> {
  if (await remove(name)) kvman.toast('kvcoder.config.workers.removed', { name }, 'success');
  removing.value = undefined;
}
</script>

<template>
  <WorkerForm v-if="form !== undefined" v-bind="form.entry === undefined ? {} : { entry: form.entry }" :taken="workers.filter((worker) => worker.name !== form?.entry?.name).map((worker) => worker.name)" :working="working" @save="saved" @cancel="form = undefined" />
  <div v-else class="kvc-dialog-rows" data-test="workers">
    <p class="kvc-muted">{{ kvman.t('kvcoder.config.workers.intro') }}</p>
    <p v-if="locked" class="kvc-muted" data-test="workers-own-value">{{ kvman.t('kvcoder.config.connectors.ownValue', { name: kvman.workspace.value.name }) }}</p>
    <div v-else-if="changed" class="kvc-connectors-state">
      <span class="kvc-chip" data-test="workers-changed">{{ scoped('kvcoder.config.connectors.changed') }}</span>
      <button type="button" class="kvc-text-button" :disabled="working" data-test="workers-reset" @click="reset">{{ scoped('kvcoder.config.connectors.reset') }}</button>
    </div>
    <p v-if="workers.length === 0" class="kvc-muted" data-test="workers-empty">{{ kvman.t('kvcoder.config.workers.empty') }}</p>
    <div v-for="worker in workers" :key="worker.name" class="kvc-connector" :data-test="`worker-${worker.name}`">
      <span class="kvc-connector-text">
        <span class="kvc-mono kvc-connector-name" data-test="worker-name">{{ worker.name }}</span>
        <span class="kvc-muted" dir="auto" data-test="worker-description">{{ worker.description }}</span>
        <span><span class="kvc-chip" data-test="worker-kind">{{ kvman.t(`kvcoder.config.workers.kind.${worker.kind}`) }}</span></span>
        <span v-if="states[worker.name] === 'checking'" class="kvc-server-state" data-status="checking" role="status" data-test="worker-state">{{ kvman.t('kvcoder.config.workers.checking') }}</span>
        <span v-else-if="states[worker.name] === 'notFound'" class="kvc-server-state" data-status="failed" role="status" data-test="worker-state">
          {{ kvman.t('kvcoder.config.workers.notFound', { program: worker.kind }) }}
          <button type="button" class="kvc-text-button" data-test="worker-check" @click="check(worker.name)">{{ kvman.t('kvcoder.config.workers.recheck') }}</button>
        </span>
      </span>
      <span v-if="removing === worker.name" class="kvc-connector-actions" role="alertdialog" :aria-label="named('removeConfirm', worker.name)" data-test="worker-remove-confirm">
        <span class="kvc-muted">{{ named('removeConfirm', worker.name) }}</span>
        <button type="button" class="kvc-button" :disabled="working" data-test="worker-remove-cancel" @click="removing = undefined">{{ kvman.t('kvcoder.config.workers.cancel') }}</button>
        <button type="button" class="kvc-button kvc-danger" :disabled="working" data-test="worker-remove-yes" @click="removed(worker.name)">{{ kvman.t('kvcoder.config.workers.removeYes') }}</button>
      </span>
      <span v-else class="kvc-connector-actions">
        <button type="button" class="kvc-button kvc-ghost kvc-icon-button" :disabled="locked || working" :aria-label="named('edit', worker.name)" :title="named('edit', worker.name)" data-test="worker-edit" @click="form = { entry: worker }">
          <Pencil :size="16" aria-hidden="true" />
        </button>
        <button type="button" class="kvc-button kvc-ghost kvc-icon-button" :disabled="locked || working" :aria-label="named('remove', worker.name)" :title="named('remove', worker.name)" data-test="worker-remove" @click="removing = worker.name">
          <Trash2 :size="16" aria-hidden="true" />
        </button>
        <button type="button" role="switch" class="kvc-switch" :aria-checked="worker.enabled" :aria-label="named('use', worker.name)" :disabled="locked || working" data-test="worker-switch" @click="toggle(worker.name)">
          <span class="kvc-switch-knob" aria-hidden="true" />
        </button>
      </span>
    </div>
    <div class="kvc-actions">
      <button type="button" class="kvc-button kvc-primary" :disabled="locked || working" data-test="worker-add" @click="form = {}"><Plus :size="16" aria-hidden="true" />{{ kvman.t('kvcoder.config.workers.add') }}</button>
    </div>
  </div>
</template>

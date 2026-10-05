<script setup lang="ts">
import { Pencil, Plus, Trash2 } from '@lucide/vue';
import { ref } from 'vue';
import { problemKey, useKvman } from './kvman.ts';
import McpServerForm from './McpServerForm.vue';
import type { McpServerEntry } from './mcp-server-entry.ts';
import { useMcpServers, type SecretChanges, type ServerState } from './use-mcp-servers.ts';

// The `mcp` connector's configuration (plan 08 §8.7, ADR 0020, 9, 14, and 15): the servers, each with its state, and
// the form that adds or edits one. The list is saved into the scope the extension's page is set to.
const kvman = useKvman();
const { servers, states, secrets, locked, changed, working, save, remove, reset, check, signIn, signOut, signedIn } = useMcpServers(kvman);
const form = ref<{ entry?: McpServerEntry }>();
const removing = ref<string>();
const scoped = (key: string): string => kvman.t(`${key}.${kvman.scope.value}`, { name: kvman.workspace.value.name });

const stateOf = (name: string): ServerState => states.value[name] ?? { status: 'checking' };

function stateText(state: ServerState): string {
  if (state.status === 'ready') return kvman.t('kvcoder.config.mcp.ready', { count: state.tools });
  return kvman.t(`kvcoder.config.mcp.${state.status}`);
}

const reason = (state: ServerState): string | undefined => (state.status === 'failed' && state.problem !== undefined ? kvman.t(problemKey(state.problem.code), state.problem.params) : undefined);

async function saved(entry: McpServerEntry, changes: SecretChanges): Promise<void> {
  if (!(await save(entry, changes))) return;
  form.value = undefined;
  kvman.toast('kvcoder.config.mcp.saved', { name: entry.name }, 'success');
}

// A browser that blocks the new tab leaves the person where they were, so it says why.
async function startSignIn(name: string): Promise<void> {
  if ((await signIn(name)) === 'blocked') kvman.toast('kvcoder.config.mcp.signIn.blocked', {}, 'warning');
}

async function removed(name: string): Promise<void> {
  if (await remove(name)) kvman.toast('kvcoder.config.mcp.removed', { name }, 'success');
  removing.value = undefined;
}
</script>

<template>
  <McpServerForm v-if="form !== undefined" v-bind="form.entry === undefined ? {} : { entry: form.entry }" :taken="servers.filter((server) => server.name !== form?.entry?.name).map((server) => server.name)" :secrets="secrets" :working="working" @save="saved" @cancel="form = undefined" />
  <div v-else class="kvc-dialog-rows" data-test="mcp-servers">
    <p class="kvc-muted">{{ kvman.t('kvcoder.config.mcp.intro') }}</p>
    <p v-if="locked" class="kvc-muted" data-test="mcp-own-value">{{ kvman.t('kvcoder.config.connectors.ownValue', { name: kvman.workspace.value.name }) }}</p>
    <div v-else-if="changed" class="kvc-connectors-state">
      <span class="kvc-chip" data-test="mcp-changed">{{ scoped('kvcoder.config.connectors.changed') }}</span>
      <button type="button" class="kvc-text-button" :disabled="working" data-test="mcp-reset" @click="reset">{{ scoped('kvcoder.config.connectors.reset') }}</button>
    </div>
    <p v-if="servers.length === 0" class="kvc-muted" data-test="mcp-empty">{{ kvman.t('kvcoder.config.mcp.empty') }}</p>
    <div v-for="server in servers" :key="server.name" class="kvc-connector kvc-server" :data-test="`mcp-server-${server.name}`">
      <span class="kvc-connector-text">
        <span class="kvc-mono kvc-connector-name" data-test="mcp-server-name">{{ server.name }}</span>
        <span class="kvc-muted" dir="auto" data-test="mcp-server-description">{{ server.description }}</span>
        <span class="kvc-server-state" :data-status="stateOf(server.name).status" role="status" data-test="mcp-server-state">
          {{ stateText(stateOf(server.name)) }}
          <button v-if="stateOf(server.name).status !== 'checking'" type="button" class="kvc-text-button" data-test="mcp-server-check" @click="check(server.name)">{{ kvman.t('kvcoder.config.mcp.recheck') }}</button>
          <button v-if="'url' in server && signedIn(server.name)" type="button" class="kvc-text-button" :disabled="working" data-test="mcp-server-sign-out" @click="signOut(server.name)">{{ kvman.t('kvcoder.config.mcp.signOut') }}</button>
        </span>
        <button v-if="'url' in server && stateOf(server.name).status === 'signInNeeded'" type="button" class="kvc-button kvc-primary kvc-server-sign-in" :disabled="working" data-test="mcp-server-sign-in" @click="startSignIn(server.name)">{{ kvman.t('kvcoder.config.mcp.signIn') }}</button>
        <span v-if="reason(stateOf(server.name)) !== undefined" class="kvc-muted kvc-server-reason" dir="auto" data-test="mcp-server-reason">{{ reason(stateOf(server.name)) }}</span>
      </span>
      <span v-if="removing === server.name" class="kvc-connector-actions" role="alertdialog" :aria-label="kvman.t('kvcoder.config.mcp.removeConfirm', { name: server.name })" data-test="mcp-remove-confirm">
        <span class="kvc-muted">{{ kvman.t('kvcoder.config.mcp.removeConfirm', { name: server.name }) }}</span>
        <button type="button" class="kvc-button" :disabled="working" data-test="mcp-remove-cancel" @click="removing = undefined">{{ kvman.t('kvcoder.config.mcp.cancel') }}</button>
        <button type="button" class="kvc-button kvc-danger" :disabled="working" data-test="mcp-remove-yes" @click="removed(server.name)">{{ kvman.t('kvcoder.config.mcp.removeYes') }}</button>
      </span>
      <span v-else class="kvc-connector-actions">
        <button type="button" class="kvc-button kvc-ghost kvc-icon-button" :disabled="locked || working" :aria-label="kvman.t('kvcoder.config.mcp.edit', { name: server.name })" :title="kvman.t('kvcoder.config.mcp.edit', { name: server.name })" data-test="mcp-server-edit" @click="form = { entry: server }">
          <Pencil :size="16" aria-hidden="true" />
        </button>
        <button type="button" class="kvc-button kvc-ghost kvc-icon-button" :disabled="locked || working" :aria-label="kvman.t('kvcoder.config.mcp.remove', { name: server.name })" :title="kvman.t('kvcoder.config.mcp.remove', { name: server.name })" data-test="mcp-server-remove" @click="removing = server.name">
          <Trash2 :size="16" aria-hidden="true" />
        </button>
      </span>
    </div>
    <div class="kvc-actions">
      <button type="button" class="kvc-button kvc-primary" :disabled="locked || working" data-test="mcp-add" @click="form = {}"><Plus :size="16" aria-hidden="true" />{{ kvman.t('kvcoder.config.mcp.add') }}</button>
    </div>
  </div>
</template>

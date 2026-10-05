<script setup lang="ts">
import { Settings } from '@lucide/vue';
import { nextTick, ref } from 'vue';
import ConnectorDialog from './ConnectorDialog.vue';
import { useKvman } from './kvman.ts';
import McpServers from './McpServers.vue';
import ShellSettings from './ShellSettings.vue';
import { useConnectors } from './use-connectors.ts';

// The connectors of kvcoder's configuration (plan 08 §8.7, ADR 0014, 10): each with a switch, and a cog on the ones
// with a configuration of their own, which opens it in a dialog (ADR 0020, 2).
const kvman = useKvman();
const { items, locked, changed, saving, toggle, reset } = useConnectors(kvman);
const opened = ref<string>();
const cogs = new Map<string, HTMLElement>();

function keepCog(name: string, element: unknown): void {
  if (element instanceof HTMLElement) cogs.set(name, element);
  else cogs.delete(name);
}

// Focus goes back to the cog that opened the dialog.
async function close(): Promise<void> {
  const name = opened.value;
  opened.value = undefined;
  await nextTick();
  if (name !== undefined) cogs.get(name)?.focus();
}
const scoped = (key: string): string => kvman.t(`${key}.${kvman.scope.value}`, { name: kvman.workspace.value.name });
</script>

<template>
  <div class="kvc-connectors" data-test="connectors">
    <p v-if="locked" class="kvc-muted" data-test="connectors-own-value">{{ kvman.t('kvcoder.config.connectors.ownValue', { name: kvman.workspace.value.name }) }}</p>
    <div v-else-if="changed" class="kvc-connectors-state">
      <span class="kvc-chip" data-test="connectors-changed">{{ scoped('kvcoder.config.connectors.changed') }}</span>
      <button type="button" class="kvc-text-button" :disabled="saving" data-test="connectors-reset" @click="reset">{{ scoped('kvcoder.config.connectors.reset') }}</button>
    </div>
    <div v-for="item in items" :key="item.name" class="kvc-connector" :data-test="`connector-${item.name}`">
      <span class="kvc-connector-text">
        <span class="kvc-mono kvc-connector-name" data-test="connector-name">{{ item.name }}</span>
        <span class="kvc-muted" dir="auto" data-test="connector-description">{{ item.description }}</span>
      </span>
      <span class="kvc-connector-actions">
        <button
          v-if="item.configurable"
          :ref="(element) => keepCog(item.name, element)"
          type="button"
          class="kvc-button kvc-ghost kvc-icon-button"
          aria-haspopup="dialog"
          :aria-label="kvman.t('kvcoder.config.connectors.configure', { name: item.name })"
          :title="kvman.t('kvcoder.config.connectors.configure', { name: item.name })"
          data-test="connector-configure"
          @click="opened = item.name"
        >
          <Settings :size="18" aria-hidden="true" />
        </button>
        <button
          type="button"
          role="switch"
          class="kvc-switch"
          :aria-checked="item.on"
          :aria-label="kvman.t('kvcoder.config.connectors.use', { name: item.name })"
          :disabled="locked || saving"
          data-test="connector-switch"
          @click="toggle(item.name)"
        >
          <span class="kvc-switch-knob" aria-hidden="true" />
        </button>
      </span>
    </div>
    <ConnectorDialog v-if="opened !== undefined" :name="opened" @close="close">
      <ShellSettings v-if="opened === 'shell'" />
      <McpServers v-else-if="opened === 'mcp'" />
    </ConnectorDialog>
  </div>
</template>

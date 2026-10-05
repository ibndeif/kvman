<script setup lang="ts">
import { useKvman } from './kvman.ts';
import { useConnectors } from './use-connectors.ts';

// The connectors of kvcoder's configuration (plan 08 §8.7, ADR 0014, 10): each with a switch.
const kvman = useKvman();
const { items, locked, changed, saving, toggle, reset } = useConnectors(kvman);
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
    </div>
  </div>
</template>

<script setup lang="ts">
import { useKvman } from './kvman.ts';
import type { useSetting } from './use-setting.ts';

// One of kvcoder's settings as a row of a connector's dialog (ADR 0020, 13): its title and description, the control in
// the slot, and what a setting row says about the scope being edited.
const props = defineProps<{ settingKey: string; name: string; setting: ReturnType<typeof useSetting>; saved: boolean }>();
const kvman = useKvman();
const scoped = (key: string): string => kvman.t(`${key}.${kvman.scope.value}`, { name: kvman.workspace.value.name });
</script>

<template>
  <div class="kvc-setting" :data-test="props.name">
    <span class="kvc-setting-text">
      <span class="kvc-setting-title" :data-test="`${props.name}-title`">{{ kvman.t(`${props.settingKey}.title`) }}</span>
      <span class="kvc-muted">{{ kvman.t(`${props.settingKey}.description`) }}</span>
    </span>
    <span class="kvc-setting-control">
      <slot :disabled="props.setting.locked.value || props.setting.saving.value" />
      <span v-if="props.setting.locked.value" class="kvc-muted" :data-test="`${props.name}-own-value`">{{ kvman.t('kvcoder.config.setting.ownValue', { name: kvman.workspace.value.name }) }}</span>
      <span v-else-if="props.setting.changed.value || props.saved" class="kvc-connectors-state">
        <span v-if="props.saved" class="kvc-muted" role="status" :data-test="`${props.name}-saved`">{{ kvman.t('kvcoder.config.setting.saved') }}</span>
        <template v-if="props.setting.changed.value">
          <span class="kvc-chip" :data-test="`${props.name}-changed`">{{ scoped('kvcoder.config.setting.changed') }}</span>
          <button type="button" class="kvc-text-button" :disabled="props.setting.saving.value" :data-test="`${props.name}-reset`" @click="props.setting.reset">{{ scoped('kvcoder.config.setting.reset') }}</button>
        </template>
      </span>
    </span>
  </div>
</template>

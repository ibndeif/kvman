<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { Scope } from '../../state/setting-save.ts';

// The one switch of an extension's page (ADR 0013, 2): where its changes are stored.
const props = defineProps<{ workspaceName: string }>();
const scope = defineModel<Scope>({ required: true });
const { t } = useI18n();
</script>

<template>
  <div role="group" :aria-label="t('kvwebui.settings.appliesTo')" class="flex w-fit gap-0.5 rounded-xl bg-neutral-soft p-0.75">
    <button
      v-for="choice in (['global', 'workspace'] as const)"
      :key="choice"
      type="button"
      class="h-8 max-w-60 truncate rounded-lg px-3.5 text-[13px]"
      :class="scope === choice ? 'bg-surface font-medium text-ink shadow-sm' : 'text-neutral-ink'"
      :aria-pressed="scope === choice"
      :data-test="`scope-${choice}`"
      @click="scope = choice"
    >
      {{ t(`kvwebui.settings.scope.${choice}`, { name: props.workspaceName }) }}
    </button>
  </div>
</template>

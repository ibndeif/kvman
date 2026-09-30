<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { textParams } from '../../contributions/references.ts';
import { useKvwebui } from '../../state/kvwebui.ts';
import ModalDialog from './ModalDialog.vue';

// The in-app confirmation for a button's `confirm` (ADR 0009, 75).
const { confirmations } = useKvwebui();
const current = confirmations.current;
const { t } = useI18n();
</script>

<template>
  <ModalDialog v-if="current" :label="t(current.text, textParams(current.params, {}))" @close="current.answer(false)">
    <span class="text-lg font-semibold">{{ t(current.text, textParams(current.params, {})) }}</span>
    <div class="flex justify-end gap-2.5">
      <button type="button" class="h-9.5 rounded-xl border border-line bg-surface px-3.5 font-medium" data-test="confirm-cancel" @click="current.answer(false)">
        {{ t('kvwebui.cancel') }}
      </button>
      <button
        type="button"
        class="h-9.5 rounded-xl px-3.5 font-medium"
        :class="current.danger ? 'bg-danger text-surface' : 'bg-primary text-on-primary'"
        data-test="confirm-ok"
        @click="current.answer(true)"
      >
        {{ t('kvwebui.confirm') }}
      </button>
    </div>
  </ModalDialog>
</template>

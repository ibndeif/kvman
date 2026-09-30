<script setup lang="ts">
import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import { useKvwebui } from '../../state/kvwebui.ts';

// Toasts at the bottom end corner (ADR 0009, 75).
const { toasts } = useKvwebui();
const { t } = useI18n();
const icons = { info: Info, success: CircleCheck, warning: TriangleAlert, error: CircleAlert };
const tones = { info: 'text-primary', success: 'text-success-ink', warning: 'text-warning-ink', error: 'text-danger' };
</script>

<template>
  <div class="pointer-events-none fixed end-6 bottom-12 z-50 flex w-90 max-w-[calc(100vw-2rem)] flex-col gap-2" aria-live="polite">
    <div v-for="toast in toasts.list" :key="toast.id" role="status" :data-level="toast.level" class="pointer-events-auto flex items-start gap-3 rounded-xl bg-toast px-4 py-3.5 text-on-toast shadow-xl">
      <component :is="icons[toast.level]" class="mt-0.5 size-4.5 shrink-0" :class="tones[toast.level]" aria-hidden="true" />
      <span class="flex grow flex-col gap-0.5">
        <span>{{ t(toast.text, toast.params) }}</span>
        <span v-if="toast.hint" class="text-sm opacity-75">{{ t(toast.hint) }}</span>
      </span>
      <button type="button" class="opacity-70" :aria-label="t('kvwebui.close')" @click="toasts.close(toast.id)"><X class="size-4" aria-hidden="true" /></button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Problem } from '@kvman/sdk';
import { CircleAlert, X } from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import { problemKey, problemParams } from '../../api/problem-text.ts';

// A failure as a plain sentence, with its code, English message, and params under "Details" (ADR 0009, 75). Without a
// Problem, only the title shows.
const props = defineProps<{ problem?: Problem | undefined; title?: string; titleParams?: Record<string, string>; retry?: () => void; dismiss?: () => void }>();
const { t } = useI18n();
</script>

<template>
  <div role="alert" class="flex gap-3.5 rounded-2xl border border-danger-line bg-danger-soft p-4 text-danger-ink">
    <CircleAlert class="size-5 shrink-0 text-danger" aria-hidden="true" />
    <div class="flex min-w-0 grow flex-col gap-1">
      <span class="font-semibold">{{ t(props.title ?? 'kvwebui.errors.partFailed', props.titleParams ?? {}) }}</span>
      <template v-if="props.problem">
      <span>{{ t(problemKey(props.problem), problemParams(props.problem)) }}</span>
      <details class="pt-1">
        <summary class="cursor-pointer font-medium">{{ t('kvwebui.errors.details') }}</summary>
        <div class="flex flex-col gap-0.5 pt-1 font-mono text-xs break-all">
          <span data-test="problem-code">{{ props.problem.code }}</span>
          <span>{{ props.problem.message }}</span>
          <span v-if="props.problem.params !== undefined">{{ JSON.stringify(props.problem.params) }}</span>
        </div>
      </details>
      </template>
    </div>
    <button v-if="props.retry" type="button" class="h-8 shrink-0 rounded-lg border border-line bg-surface px-3 font-medium text-ink" @click="props.retry">
      {{ t('kvwebui.errors.retry') }}
    </button>
    <button v-if="props.dismiss" type="button" class="grid size-8 shrink-0 place-items-center rounded-lg" :aria-label="t('kvwebui.dismiss')" @click="props.dismiss">
      <X class="size-4" aria-hidden="true" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { SearchX } from '@lucide/vue';
import { useI18n } from 'vue-i18n';

// A URL no loaded page matches (ADR 0009, 72).
const { t } = useI18n();
</script>

<template>
  <section class="flex flex-col items-center gap-3 rounded-2xl border border-line bg-surface px-6 py-12 text-center" data-test="not-found">
    <span class="grid size-12 place-items-center rounded-2xl bg-neutral-soft text-neutral-ink"><SearchX class="size-5.5" aria-hidden="true" /></span>
    <h1 class="m-0 text-lg font-semibold">{{ t('kvwebui.notFound.title') }}</h1>
    <p class="m-0 text-muted">{{ t('kvwebui.notFound.help') }}</p>
    <RouterLink to="/" class="font-medium text-primary">{{ t('kvwebui.notFound.home') }}</RouterLink>
  </section>
</template>

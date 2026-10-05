<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { sourceKey } from '../../state/preset.ts';
import RemoveExtension from './RemoveExtension.vue';

// An extension the stored preset has that isn't loaded yet (plan 06 §6.6): it starts after the next restart.
const props = defineProps<{ name: string; source: string }>();
const { t } = useI18n();
</script>

<template>
  <section class="flex flex-wrap items-center gap-3.5 rounded-2xl border border-dashed border-line bg-surface px-4.5 py-3.5" :data-test="`pending-${props.name}`">
    <span class="flex grow flex-col gap-0.5">
      <span class="flex flex-wrap items-center gap-2">
        <span dir="ltr" class="font-semibold">{{ props.name }}</span>
        <span class="rounded-full bg-neutral-soft px-2.5 py-0.5 text-xs font-medium text-neutral-ink" data-test="extension-source">{{ t(sourceKey(props.source)) }}</span>
        <span class="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent-ink" data-test="extension-mark">{{ t('kvwebui.extensions.mark.starts') }}</span>
      </span>
      <span dir="ltr" class="font-mono text-xs text-muted">{{ props.source }}</span>
    </span>
    <RemoveExtension :name="props.name" />
  </section>
</template>

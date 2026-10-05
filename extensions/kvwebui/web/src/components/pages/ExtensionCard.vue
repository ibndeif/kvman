<script setup lang="ts">
import { ChevronRight } from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import type { ExtensionInfo } from '../../api/kernel.ts';
import { extensionPath, extensionTitle } from '../../state/extension-text.ts';
import { sourceKey } from '../../state/preset.ts';

// One extension in the list (ADR 0014, 4): its title, package name, version, and source, as a link to its own page.
const props = defineProps<{ extension: ExtensionInfo; removed?: boolean }>();
const translator = useI18n();
const { t } = translator;
</script>

<template>
  <RouterLink :to="extensionPath(props.extension.namespace)" class="flex items-center gap-3.5 rounded-2xl border border-line bg-surface px-4.5 py-3.5 hover:border-primary" :data-test="`extension-${props.extension.namespace}`">
    <span class="grid size-9 shrink-0 place-items-center rounded-xl bg-neutral-soft text-[13px] font-semibold text-neutral-ink" aria-hidden="true">{{ extensionTitle(translator, props.extension).slice(0, 2) }}</span>
    <span class="flex min-w-0 grow flex-col gap-0.5">
      <span class="flex flex-wrap items-center gap-2">
        <span class="font-semibold" data-test="extension-title">{{ extensionTitle(translator, props.extension) }}</span>
        <span class="rounded-full bg-neutral-soft px-2.5 py-0.5 text-xs font-medium text-neutral-ink" data-test="extension-source">{{ t(sourceKey(props.extension.source)) }}</span>
        <span v-if="props.removed" class="rounded-full bg-warning-soft px-2.5 py-0.5 text-xs font-medium text-warning-ink" data-test="extension-mark">{{ t('kvwebui.extensions.mark.removed') }}</span>
      </span>
      <span class="flex flex-wrap gap-2 text-[13px] text-muted">
        <span dir="ltr" class="font-mono text-xs" data-test="extension-name">{{ props.extension.name }}</span>
        <span dir="ltr" class="font-mono text-xs" data-test="extension-version">{{ props.extension.version }}</span>
      </span>
    </span>
    <ChevronRight class="size-4.5 shrink-0 text-muted rtl:-scale-x-100" aria-hidden="true" />
  </RouterLink>
</template>

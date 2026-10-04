<script setup lang="ts">
import { ChevronDown } from '@lucide/vue';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { ExtensionInfo } from '../../api/kernel.ts';
import { sourceKey } from '../../state/preset.ts';
import RemoveExtension from './RemoveExtension.vue';

// One extension (ADR 0009, 78): name, version, source, and counts; opened, its commands and queries (with translated
// or English descriptions and a "Public" badge), settings, and handlers. A search opens the card on its matches.
const props = defineProps<{ extension: ExtensionInfo; search: string; removed?: boolean }>();
const { t, te } = useI18n();
const opened = ref(false);
const described = (name: string, english: string): string => (te(`${name}.description`) ? t(`${name}.description`) : english);
const source = computed(() => sourceKey(props.extension.source));
const needle = computed(() => props.search.trim().toLowerCase());
const calls = computed(() =>
  [...props.extension.commands, ...props.extension.queries].filter(
    (call) => needle.value === '' || call.name.toLowerCase().includes(needle.value) || described(call.name, call.description).toLowerCase().includes(needle.value),
  ),
);
const open = computed(() => opened.value || (needle.value !== '' && calls.value.length > 0));
const counts = computed(() => [
  { label: 'kvwebui.extensions.commands', count: props.extension.commands.length },
  { label: 'kvwebui.extensions.queries', count: props.extension.queries.length },
  { label: 'kvwebui.extensions.settings', count: props.extension.settings.length },
  { label: 'kvwebui.extensions.handlers', count: props.extension.handlers.length },
]);
</script>

<template>
  <section class="rounded-2xl border border-line bg-surface" :data-test="`extension-${props.extension.namespace}`">
    <button type="button" class="flex w-full items-center gap-3.5 px-4.5 py-3.5 text-start" :aria-expanded="open" @click="opened = !opened">
      <span class="grid size-9 shrink-0 place-items-center rounded-xl bg-neutral-soft text-[13px] font-semibold text-neutral-ink" aria-hidden="true">{{ props.extension.namespace.slice(0, 2) }}</span>
      <span class="flex grow flex-col gap-0.5">
        <span class="flex flex-wrap items-center gap-2">
          <span class="font-semibold">{{ props.extension.name }}</span>
          <span class="font-mono text-xs text-muted">{{ props.extension.version }}</span>
          <span class="rounded-full bg-neutral-soft px-2.5 py-0.5 text-xs font-medium text-neutral-ink" data-test="extension-source">{{ t(source) }}</span>
          <span v-if="props.removed" class="rounded-full bg-warning-soft px-2.5 py-0.5 text-xs font-medium text-warning-ink" data-test="extension-mark">{{ t('kvwebui.extensions.mark.removed') }}</span>
        </span>
        <span class="flex flex-wrap gap-3 text-[13px] text-muted">
          <span v-for="entry in counts" :key="entry.label">{{ t(entry.label) }} {{ entry.count }}</span>
        </span>
      </span>
      <ChevronDown class="size-4.5 text-muted transition-transform" :class="open ? 'rotate-180' : ''" aria-hidden="true" />
    </button>
    <div v-if="!props.removed" class="border-t border-line-soft px-4.5 py-3">
      <RemoveExtension :name="props.extension.name" />
    </div>
    <div v-if="open" class="flex flex-col border-t border-line-soft">
      <div v-for="call in calls" :key="call.name" class="flex flex-wrap items-baseline gap-3 border-b border-line-soft px-4.5 py-2.5" data-test="extension-call">
        <span class="w-64 font-mono text-[12.5px]">{{ call.name }}</span>
        <span v-if="call.public" class="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent-ink">{{ t('kvwebui.extensions.public') }}</span>
        <span class="grow text-muted">{{ described(call.name, call.description) }}</span>
      </div>
      <div v-for="setting in props.extension.settings" :key="setting.key" class="flex flex-wrap items-baseline gap-3 border-b border-line-soft px-4.5 py-2.5">
        <span class="w-64 font-mono text-[12.5px]">{{ setting.key }}</span>
        <span class="grow text-muted">{{ described(setting.key, setting.description) }}</span>
      </div>
      <div v-for="handler in props.extension.handlers" :key="handler.point" class="flex flex-wrap items-baseline gap-3 px-4.5 py-2.5">
        <span class="w-64 font-mono text-[12.5px]">{{ handler.point }}</span>
        <span class="grow text-muted">{{ handler.description }}</span>
      </div>
    </div>
  </section>
</template>

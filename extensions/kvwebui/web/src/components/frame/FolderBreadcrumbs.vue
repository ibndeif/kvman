<script setup lang="ts">
import { ChevronRight } from '@lucide/vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { pathSegments } from '../../state/folder-path.ts';

// The folder shown, as segments that each go to their folder (plan 06 §6.2, ADR 0009, 224). Paths read left to right.
const props = defineProps<{ path: string }>();
const emit = defineEmits<{ go: [path: string] }>();
const { t } = useI18n();
const segments = computed(() => pathSegments(props.path));
</script>

<template>
  <nav :aria-label="t('kvwebui.workspace.pathLabel')" dir="ltr" class="flex min-w-0 flex-wrap items-center gap-0.5 text-[13px]" data-test="folder-crumbs">
    <template v-for="(segment, index) in segments" :key="segment.path">
      <ChevronRight v-if="index > 1" :size="12" class="shrink-0 text-muted" aria-hidden="true" />
      <button type="button" class="max-w-40 truncate rounded-md px-1.5 py-0.5 hover:bg-sunken" :class="index === segments.length - 1 ? 'font-semibold' : 'text-muted'" :aria-current="index === segments.length - 1 ? 'location' : undefined" :data-test="`folder-crumb-${String(index)}`" @click="emit('go', segment.path)">{{ segment.name }}</button>
    </template>
  </nav>
</template>

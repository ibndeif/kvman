<script setup lang="ts">
import { House } from '@lucide/vue';
import { useI18n } from 'vue-i18n';

// Home and the folder of each open workspace, as places to go to (plan 06 §6.2, ADR 0009, 224); the one being shown is marked.
export type Place = { id: string; label: string; path: string };
const props = defineProps<{ places: Place[]; current: string | undefined }>();
const emit = defineEmits<{ go: [path: string] }>();
const { t } = useI18n();
</script>

<template>
  <div role="group" :aria-label="t('kvwebui.workspace.places')" class="flex flex-wrap gap-1.5" data-test="folder-places">
    <button v-for="place in props.places" :key="place.id" type="button" class="flex h-8 max-w-48 items-center gap-1.5 rounded-lg border px-2.5 text-[13px]" :class="place.path === props.current ? 'border-primary bg-accent-soft text-accent-ink' : 'border-line bg-surface'" :aria-current="place.path === props.current ? 'true' : undefined" :title="place.path" :data-test="`folder-place-${place.id}`" @click="emit('go', place.path)">
      <House v-if="place.id === 'home'" :size="14" aria-hidden="true" /><span class="truncate" dir="auto">{{ place.label }}</span>
    </button>
  </div>
</template>

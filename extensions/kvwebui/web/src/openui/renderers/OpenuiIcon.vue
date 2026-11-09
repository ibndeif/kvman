<script setup lang="ts">
import { computed } from 'vue';
import { iconComponent } from '../../contributions/icons.ts';
import { resolvedIconName } from '../icon-names.ts';

// OpenUI's Icon (plan 06 §6.1, ADR 0124, 8): the named Lucide icon, its category's fallback, or `circle-dot`, loaded the
// first time it is shown and drawn at one em.
const props = defineProps<{ name: string; category?: string | undefined }>();
const icon = computed(() => iconComponent(resolvedIconName(props.name, props.category)));
</script>

<template>
  <component :is="icon" v-if="icon" size="1em" aria-hidden="true" />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { avatarOf } from './avatar.ts';

// One avatar everywhere (plan 07 §7.3, ADR 0009, 243): a round letter on the provider's palette colour.
const props = defineProps<{ providerId: string; title: string; size?: 'sm' | 'md' | 'lg' | 'xl' }>();

const avatar = computed(() => avatarOf(props.providerId, props.title));
const pixels = computed(() => (props.size === 'sm' ? 30 : props.size === 'lg' ? 44 : props.size === 'xl' ? 56 : 38));
</script>

<template>
  <span
    class="kvai-avatar"
    aria-hidden="true"
    data-test="avatar"
    :style="{ backgroundColor: avatar.color, inlineSize: `${pixels}px`, blockSize: `${pixels}px`, fontSize: `${Math.round(pixels * 0.42)}px` }"
    >{{ avatar.letter }}</span
  >
</template>

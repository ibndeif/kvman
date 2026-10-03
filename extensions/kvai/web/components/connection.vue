<script setup lang="ts">
import '../styles/kvai.css';
import ConnectionCard from '../src/ConnectionCard.vue';

// `kvai.connection { providerId }` (plan 07 §7.3): the provider's connection card.
const props = defineProps<{ providerId: string }>();
</script>

<template>
  <ConnectionCard :provider-id="props.providerId" />
</template>

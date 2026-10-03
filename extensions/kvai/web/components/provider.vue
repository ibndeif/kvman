<script setup lang="ts">
import '../styles/kvai.css';
import '../styles/provider.css';
import ProviderPage from '../src/ProviderPage.vue';

// `kvai.provider` (plan 07 §7.3): the Provider page.
const props = defineProps<{ providerId: string }>();
</script>

<template>
  <ProviderPage :provider-id="props.providerId" />
</template>

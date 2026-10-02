<script setup lang="ts">
import { computed } from 'vue';
import { frameableUrl } from './artifact-url.ts';
import { useKvman } from './kvman.ts';

// A `url` artifact (plan 08 §8.7, ADR 0009, 216): the page in a frame that runs scripts only, like an HTML artifact's: no
// `allow-same-origin`, so it has an opaque origin and can't read kvman's page, and kvman refuses `Origin: null`. An
// address that isn't a local page, or is kvman's own, isn't framed at all.
const props = defineProps<{ label: string; content: string }>();
const kvman = useKvman();
const address = computed(() => frameableUrl(props.content, window.location));
</script>

<template>
  <iframe v-if="address !== undefined" class="kvc-artifact-frame" sandbox="allow-scripts" referrerpolicy="no-referrer" :title="props.label" :src="address" data-test="artifact-url-frame" />
  <p v-else class="kvc-muted" role="alert" data-test="artifact-url-refused">{{ kvman.t('kvcoder.ui.artifacts.urlRefused') }}</p>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { frameableUrl } from './artifact-url.ts';
import { useKvman } from './kvman.ts';

// A `url` artifact (plan 08 §8.7, ADR 0009, 216 and 218): the page, in a frame that lets it work as it does in a tab:
// scripts, its own storage, forms, popups, dialogs, and downloads. `allow-same-origin` gives it its own origin, never
// kvman's, because an address on kvman's own port is not framed at all; it can't navigate the page above it, and its
// requests to kvman carry its own origin, which kvman refuses. An address that isn't a local page isn't framed either.
const props = defineProps<{ label: string; content: string }>();
const kvman = useKvman();
const address = computed(() => frameableUrl(props.content, window.location));
</script>

<template>
  <iframe v-if="address !== undefined" class="kvc-artifact-frame" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads" referrerpolicy="no-referrer" :title="props.label" :src="address" data-test="artifact-url-frame" />
  <p v-else class="kvc-muted" role="alert" data-test="artifact-url-refused">{{ kvman.t('kvcoder.ui.artifacts.urlRefused') }}</p>
</template>

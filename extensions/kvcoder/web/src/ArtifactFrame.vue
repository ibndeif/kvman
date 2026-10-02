<script setup lang="ts">
import { computed } from 'vue';
import { artifactDocument } from './artifact-document.ts';

// An HTML artifact (plan 08 §8.7, ADR 0009, 178 and 179): its own document in a sandboxed frame. `allow-scripts` is the
// only sandbox token: without `allow-same-origin` the frame has an opaque origin, so it can't read this page, its
// storage, or its cookies, and `Origin: null` is refused by kvman. The policy in the document bars the network.
const props = defineProps<{ label: string; content: string }>();
const srcdoc = computed(() => artifactDocument(props.content));
</script>

<template>
  <iframe class="kvc-artifact-frame" sandbox="allow-scripts" referrerpolicy="no-referrer" :title="props.label" :srcdoc="srcdoc" data-test="artifact-frame" />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { routePage } from '../../state/navigation.ts';
import { useKvwebui } from '../../state/kvwebui.ts';
import ViewNode from '../views/ViewNode.vue';
import NotFoundPage from './NotFoundPage.vue';

// `/<namespace>/<page>/<params…>` (plan 06 §6.3): the page with its route params, or "page not found".
const state = useKvwebui();
const route = useRoute();
const found = computed(() => routePage(state.registry.value, route));
const view = computed(() => (found.value === undefined ? undefined : state.registry.value.pages.get(found.value.id)?.view));
</script>

<template>
  <ViewNode v-if="found && view" :view="view" :scope="{ params: found.params }" />
  <NotFoundPage v-else />
</template>

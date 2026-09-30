<script setup lang="ts">
import { healthSchema } from '@kvman/sdk';
import { computed, toRef } from 'vue';
import { useI18n } from 'vue-i18n';
import { useQuery } from '../../composables/use-query.ts';

// The built-in status item (ADR 0009, 69): kvman's version with a green dot, or a red "offline".
const props = defineProps<{ tick: number }>();
const { t } = useI18n();
const { data, problem } = useQuery(() => 'kernel.health.get', () => ({}), toRef(props, 'tick'));
const version = computed(() => healthSchema.safeParse(data.value).data?.version);
</script>

<template>
  <span v-if="problem" class="flex items-center gap-1.5 font-medium text-danger" data-test="health"><span class="size-2 rounded-full bg-danger" />{{ t('kvwebui.status.offline') }}</span>
  <span v-else-if="version !== undefined" class="flex items-center gap-1.5" data-test="health"><span class="size-2 rounded-full bg-online" />kvman {{ version }}</span>
</template>

<script setup lang="ts">
import { useTriggerAction, type ActionConfig, type ComponentRenderProps } from '@openuidev/vue-lang';
import { ChevronRight } from '@lucide/vue';
import { computed } from 'vue';
import type { ListBlockProps } from '../definitions/lists.ts';
import { useOpenuiLive } from '../presses.ts';
import OpenuiImage from './OpenuiImage.vue';

// OpenUI's ListBlock (plan 06 §6.1, ADR 0124, 7, 14, 16): items with a number or an image, a title and a subtitle; an
// item with an action is a button that sends it (its title when the action has no text), only while the block is live.
const component = defineProps<ComponentRenderProps<ListBlockProps>>();
const trigger = useTriggerAction();
const live = useOpenuiLive();
const items = computed(() => (component.props.items ?? []).map((item) => item.props));
const imaged = computed(() => component.props.variant === 'image');
const small = computed(() => component.props.size === 'small');

function press(title: string, action: ActionConfig | undefined): void {
  if (live.value) trigger(title, undefined, action);
}
</script>

<template>
  <ol class="m-0 flex list-none flex-col p-0" :class="small ? 'gap-1' : 'gap-2'">
    <li v-for="(item, index) in items" :key="index">
      <component
        :is="item.action === undefined ? 'div' : 'button'"
        :type="item.action === undefined ? undefined : 'button'"
        :disabled="item.action === undefined ? undefined : !live"
        class="flex w-full items-center gap-3 rounded-xl border border-line bg-surface text-start disabled:opacity-50"
        :class="small ? 'px-2 py-1.5 text-sm' : 'px-3 py-2.5'"
        @click="item.action === undefined ? undefined : press(item.title, item.action)"
      >
        <OpenuiImage v-if="imaged && item.image !== undefined" :src="item.image.src" :alt="item.image.alt" class="size-10 shrink-0" />
        <span v-else-if="!imaged" class="grid size-6 shrink-0 place-items-center rounded-full bg-neutral-soft text-xs font-semibold text-neutral-ink" aria-hidden="true">{{ index + 1 }}</span>
        <span class="flex min-w-0 grow flex-col">
          <span dir="auto" class="font-medium">{{ item.title }}</span>
          <span v-if="item.subtitle !== undefined" dir="auto" class="text-sm text-muted">{{ item.subtitle }}</span>
        </span>
        <span v-if="item.action !== undefined" class="flex shrink-0 items-center gap-1 text-sm text-primary">
          <span v-if="item.actionLabel !== undefined" dir="auto">{{ item.actionLabel }}</span>
          <ChevronRight class="size-4 rtl:-scale-x-100" aria-hidden="true" />
        </span>
      </component>
    </li>
  </ol>
</template>

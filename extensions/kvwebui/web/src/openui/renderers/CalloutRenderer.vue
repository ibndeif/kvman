<script setup lang="ts">
import { isReactiveAssign } from '@openuidev/lang-core';
import { useOpenUI, type ComponentRenderProps } from '@openuidev/vue-lang';
import { computed, onUnmounted, ref, watch } from 'vue';
import type { CalloutProps } from '../definitions/content.ts';
import MarkdownView from '../../components/views/MarkdownView.vue';

// OpenUI's Callout (plan 06 §6.1, ADR 0124, 16): a banner, hidden when its reactive `visible` binding is not true and
// dismissed after 3 seconds by setting that binding to false.
const component = defineProps<ComponentRenderProps<CalloutProps>>();
const openui = useOpenUI();
const shown = ref(true);
const variants = {
  info: 'border-accent-soft bg-accent-soft text-accent-ink',
  warning: 'border-warning-soft bg-warning-soft text-warning-ink',
  error: 'border-danger-soft bg-danger-soft text-danger-ink',
  success: 'border-success-soft bg-success-soft text-success-ink',
  neutral: 'border-neutral-soft bg-neutral-soft text-neutral-ink',
};
const target = computed(() => {
  const value: unknown = component.props.visible;
  return isReactiveAssign(value) ? value.target : undefined;
});
let timer: ReturnType<typeof setTimeout> | undefined;

function clearTimer(): void {
  if (timer === undefined) return;
  clearTimeout(timer);
  timer = undefined;
}

function update(): void {
  const name = target.value;
  if (name === undefined) {
    shown.value = true;
    clearTimer();
    return;
  }
  const value = openui.store.get(name);
  shown.value = value === true || value === 'true';
  if (!shown.value) {
    clearTimer();
    return;
  }
  if (timer !== undefined) return;
  timer = setTimeout(() => {
    openui.store.set(name, false);
  }, 3000);
}

const stop = openui.store.subscribe(update);
watch(target, update, { immediate: true });
onUnmounted(() => {
  stop();
  clearTimer();
});
</script>

<template>
  <aside v-if="shown" class="rounded-xl border p-4" :class="variants[component.props.variant]" role="status">
    <p dir="auto" class="m-0 font-semibold">{{ component.props.title }}</p>
    <div class="mt-1 text-sm">
      <MarkdownView :view="{ type: 'markdown', text: 'kvwebui.openui.markdown', params: { text: component.props.description } }" :scope="{}" />
    </div>
  </aside>
</template>

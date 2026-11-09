<script setup lang="ts">
import { useOpenUI, type ComponentRenderProps } from '@openuidev/vue-lang';
import { isReactiveAssign } from '@openuidev/lang-core';
import { computed } from 'vue';
import type { ModalProps } from '../definitions/overlays.ts';
import { useField } from '../fields.ts';
import OpenuiDialog from './OpenuiDialog.vue';
import { RenderedValue } from './RenderedValue.ts';

// OpenUI's Modal (plan 06 §6.1, ADR 0124, 16): open while its `open` binding is true; Escape, its close button, and a
// press outside set the binding to false, as OpenUI's do. Opening and closing are local, so they work without live.
const component = defineProps<ComponentRenderProps<ModalProps>>();
const openui = useOpenUI();
const field = useField('Modal', () => '', () => component.props.open);
const shown = computed(() => field.value.value === true || field.value.value === 'true');

function close(): void {
  const binding: unknown = component.props.open;
  if (isReactiveAssign(binding)) openui.store.set(binding.target, false);
}
</script>

<template>
  <OpenuiDialog v-if="shown" :title="component.props.title" :size="component.props.size" @close="close">
    <div class="flex flex-col gap-3">
      <RenderedValue :value="component.props.children" :render-node="component.renderNode" />
    </div>
  </OpenuiDialog>
</template>

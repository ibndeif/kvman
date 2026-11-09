<script setup lang="ts">
import type { ComponentRenderProps } from '@openuidev/vue-lang';
import { onUnmounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useKvwebui } from '../../state/kvwebui.ts';
import type { CodeBlockProps } from '../definitions/content.ts';

// OpenUI's CodeBlock (plan 06 §6.1, ADR 0124, 16): a monospace block with a Copy button. Copy is local, so it works in an
// old reply too; a failed copy leaves the label as Copy and says so in a toast.
const component = defineProps<ComponentRenderProps<CodeBlockProps>>();
const { t } = useI18n();
const state = useKvwebui();
const copied = ref(false);
let timer: ReturnType<typeof setTimeout> | undefined;

async function copy(): Promise<void> {
  try {
    await navigator.clipboard.writeText(component.props.codeString);
  } catch {
    state.toasts.show({ text: 'kvwebui.openui.copyFailed', params: {}, level: 'error' });
    return;
  }
  copied.value = true;
  if (timer !== undefined) clearTimeout(timer);
  timer = setTimeout(() => {
    copied.value = false;
    timer = undefined;
  }, 2000);
}

onUnmounted(() => {
  if (timer !== undefined) clearTimeout(timer);
});
</script>

<template>
  <div class="overflow-hidden rounded-xl border border-line bg-sunken" dir="ltr">
    <div class="flex items-center justify-between gap-2 border-b border-line px-3 py-1.5">
      <span dir="auto" class="text-xs text-muted">{{ component.props.language }}</span>
      <button type="button" class="m-0 border-0 bg-transparent p-0 text-xs text-primary" @click="copy">
        {{ copied ? t('kvwebui.openui.copied') : t('kvwebui.openui.copy') }}
      </button>
    </div>
    <pre class="m-0 overflow-x-auto p-3 text-sm" :style="{ fontFamily: 'var(--kv-font-mono)' }"><code>{{ component.props.codeString }}</code></pre>
  </div>
</template>

<script setup lang="ts">
import type { ActionEvent, ParseResult } from '@openuidev/vue-lang';
import { Renderer } from '@openuidev/vue-lang';
import { computed, inject, provide, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { openWindow } from '../state/embedded.ts';
import { insideOpenuiKey } from './fences.ts';
import { openuiLibraries } from './libraries.ts';
import { formMessagesKey, messageOf, openuiMessageKey, provideOpenuiLive } from './presses.ts';
import { isWebAddress } from './web-address.ts';

// Draws OpenUI Lang (plan 06 §6.1, ADR 0124): a fenced `openui` block uses the chat library and the `openui` view uses
// `openuiLibrary`. A press acts only while the block is live, and a finished block that draws nothing shows its source.
const props = defineProps<{ library: 'chat' | 'full'; source: string; streaming: boolean }>();
const { t } = useI18n();
const handler = inject(openuiMessageKey, undefined);
const parsed = ref<ParseResult | null>(null);
const live = computed(() => handler?.value !== undefined && !props.streaming);
const forms = new Map<string, () => string[]>();
provide(insideOpenuiKey, true);
provide(formMessagesKey, forms);
provideOpenuiLive(live);
const failed = computed(() => !props.streaming && props.source.trim() !== '' && parsed.value !== null && parsed.value.root === null);

function act(event: ActionEvent): void {
  if (!live.value) return;
  if (event.type === 'open_url') {
    const url = event.params['url'];
    if (typeof url === 'string' && isWebAddress(url)) void openWindow(url);
    return;
  }
  const message = messageOf(event, forms);
  if (message === undefined || message === '') return;
  handler?.value?.(message);
}
</script>

<template>
  <div class="kvwebui-openui" data-test="openui">
    <Renderer :response="props.source" :library="openuiLibraries[props.library]" :is-streaming="props.streaming" :on-action="act" :on-parse-result="(result) => (parsed = result)" />
    <div v-if="failed" class="mt-2 flex flex-col gap-2">
      <p class="m-0 text-sm text-muted">{{ t('kvwebui.openui.failed') }}</p>
      <pre data-test="openui-source" class="m-0 overflow-x-auto rounded-lg bg-sunken p-3 text-sm"><code>{{ props.source }}</code></pre>
    </div>
  </div>
</template>

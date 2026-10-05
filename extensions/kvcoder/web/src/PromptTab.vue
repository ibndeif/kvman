<script setup lang="ts">
import { ArrowLeft, Copy } from '@lucide/vue';
import { ref, watch } from 'vue';
import { toastProblem, useKvman } from './kvman.ts';

// The prompt view (plan 08 §8.7, ADR 0009, 104; ADR 0017, 9): a way back to the chat, the exact system prompt of the
// next step, and each section's owner, reach, and size.
type Prompt = { prompt: string; sections: { id: string; title: string; owner: string; reach: 'global' | 'workspace' | 'session'; size: number; included: boolean }[] };
const props = defineProps<{ sessionId: string }>();
const emit = defineEmits<{ back: [] }>();
const kvman = useKvman();
const prompt = ref<Prompt | null>(null);

watch(
  () => props.sessionId,
  async (sessionId) => {
    try {
      prompt.value = await kvman.exec('kvcoder.prompt.get', { sessionId });
    } catch (error) {
      toastProblem(kvman, error);
    }
  },
  { immediate: true },
);

async function copy(): Promise<void> {
  if (prompt.value === null) return;
  await navigator.clipboard.writeText(prompt.value.prompt);
  kvman.toast('kvcoder.ui.copied', {}, 'success');
}
</script>

<template>
  <div class="kvc-column" data-test="prompt-tab">
    <div style="display: flex; align-items: center; gap: 10px">
      <button type="button" class="kvc-button" data-test="prompt-back" @click="emit('back')"><ArrowLeft :size="16" class="kvc-flip" aria-hidden="true" />{{ kvman.t('kvcoder.ui.showChat') }}</button>
      <strong style="flex: 1 1 auto">{{ kvman.t('kvcoder.ui.promptTitle') }}</strong>
      <button type="button" class="kvc-button" data-test="copy-prompt" @click="copy"><Copy :size="16" />{{ kvman.t('kvcoder.ui.copy') }}</button>
    </div>
    <ul v-if="prompt" style="margin: 0; padding-inline-start: 20px">
      <li v-for="section in prompt.sections" :key="`${section.owner}/${section.id}`" class="kvc-muted" data-test="prompt-section">
        {{ kvman.t('kvcoder.ui.section', { title: section.title, owner: section.owner, reach: kvman.t(`kvcoder.ui.reach.${section.reach}`), size: section.size }) }}
        <span v-if="!section.included" class="kvc-chip kvc-warn">{{ kvman.t('kvcoder.ui.leftOut') }}</span>
      </li>
    </ul>
    <pre v-if="prompt" class="kvc-prompt" data-test="prompt-text">{{ prompt.prompt }}</pre>
  </div>
</template>

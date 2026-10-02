<script setup lang="ts">
import { RotateCw } from '@lucide/vue';
import { toastProblem, useKvman } from './kvman.ts';
import ModelPicker from './ModelPicker.vue';
import { rememberModel } from './remember-model.ts';
import { useModelGroups } from './use-model-groups.ts';

// What the person can do after a turn stopped (plan 08 §8.7, ADR 0009, 204): Retry, which sends "Continue", or pick
// another model, which is set on the chat, remembered as the default, and followed by "Continue".
const props = defineProps<{ sessionId: string }>();
const emit = defineEmits<{ sent: [] }>();
const kvman = useKvman();
const groups = useModelGroups(kvman, () => null, (error) => toastProblem(kvman, error));

async function resume(): Promise<void> {
  await kvman.exec('kvcoder.message.send', { sessionId: props.sessionId, text: kvman.t('kvcoder.ui.continueText') });
  emit('sent');
}

async function run(action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (error) {
    toastProblem(kvman, error);
  }
}

const retry = () => run(resume);
const choose = (modelId: string) => run(async () => {
  await kvman.exec('kvcoder.session.configure', { sessionId: props.sessionId, model: modelId });
  await rememberModel(kvman, modelId);
  await resume();
});
</script>

<template>
  <div class="kvc-recovery" data-test="recovery">
    <button type="button" class="kvc-button" data-test="retry" @click="retry"><RotateCw :size="14" aria-hidden="true" />{{ kvman.t('kvcoder.ui.retry') }}</button>
    <div class="kvc-recovery-picker">
      <ModelPicker :groups="groups" :current="null" :empty="kvman.t('kvcoder.ui.chooseAnotherModel')" @pick="choose" />
    </div>
  </div>
</template>

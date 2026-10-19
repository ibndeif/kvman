<script setup lang="ts">
import { RotateCw } from '@lucide/vue';
import { computed, ref } from 'vue';
import { toastProblem, useKvman } from './kvman.ts';
import ModelPicker from './ModelPicker.vue';
import { rememberModel } from './remember-model.ts';
import { useModelGroups } from './use-model-groups.ts';

// What the person can do after a turn stopped (plan 08 §8.7, ADR 0009, 204; ADR 0050, 3): Retry, which runs the turn
// again and adds no message, or pick another model, which is set on the chat, remembered as the default, and retried.
// When the model's account is out of use, has no key, or is limiting calls, another model comes first (ADR 0090, 5).
const props = defineProps<{ sessionId: string; failedWith?: string | undefined }>();
const emit = defineEmits<{ sent: [] }>();
const kvman = useKvman();
const groups = useModelGroups(kvman, () => null, (error) => toastProblem(kvman, error));

async function resume(): Promise<void> {
  await kvman.exec('kvcoder.turn.retry', { sessionId: props.sessionId });
  emit('sent');
}

// One recovery at a time: a second press while the first is on its way does nothing.
const busy = ref(false);
async function run(action: () => Promise<void>): Promise<void> {
  if (busy.value) return;
  busy.value = true;
  try {
    await action();
  } catch (error) {
    toastProblem(kvman, error);
  } finally {
    busy.value = false;
  }
}

const modelFirst = new Set(['kvai/USAGE_LIMIT', 'kvai/KEY_MISSING', 'kvai/RATE_LIMITED']);
const pickFirst = computed(() => props.failedWith !== undefined && modelFirst.has(props.failedWith));
const retry = () => run(resume);
const choose = (modelId: string) => run(async () => {
  await kvman.exec('kvcoder.session.configure', { sessionId: props.sessionId, model: modelId });
  await rememberModel(kvman, modelId);
  await resume();
});
</script>

<template>
  <div class="kvc-recovery" data-test="recovery">
    <button v-if="!pickFirst" type="button" class="kvc-button" :disabled="busy" data-test="retry" @click="retry"><RotateCw :size="14" aria-hidden="true" />{{ kvman.t('kvcoder.ui.retry') }}</button>
    <div class="kvc-recovery-picker">
      <ModelPicker :groups="groups" :current="null" :empty="kvman.t('kvcoder.ui.chooseAnotherModel')" @pick="choose" />
    </div>
    <button v-if="pickFirst" type="button" class="kvc-button" :disabled="busy" data-test="retry" @click="retry"><RotateCw :size="14" aria-hidden="true" />{{ kvman.t('kvcoder.ui.retry') }}</button>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, useTemplateRef } from 'vue';
import { useI18n } from 'vue-i18n';

// The name of a new folder (plan 06 §6.2, ADR 0009, 222): Enter or Create makes it; Escape closes the row.
const props = defineProps<{ busy: boolean; reason: string | undefined }>();
const emit = defineEmits<{ create: [name: string]; cancel: [] }>();
const { t } = useI18n();
const name = ref('');
const field = useTemplateRef<HTMLInputElement>('field');
onMounted(() => field.value?.focus());
const submit = (): void => {
  if (name.value.trim() !== '' && !props.busy) emit('create', name.value);
};
</script>

<template>
  <form class="flex flex-col gap-1.5" data-test="folder-new-row" @submit.prevent="submit">
    <div class="flex gap-2">
      <input ref="field" v-model="name" type="text" class="h-9 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 text-[14px]" :aria-label="t('kvwebui.workspace.newFolderName')" :placeholder="t('kvwebui.workspace.newFolderName')" data-test="folder-new-name" @keydown.esc.stop="emit('cancel')" />
      <button type="submit" class="h-9 rounded-xl bg-primary px-3 text-[14px] font-medium text-on-primary disabled:opacity-50" :disabled="props.busy || name.trim() === ''" data-test="folder-create">{{ t('kvwebui.workspace.create') }}</button>
    </div>
    <span v-if="props.reason" class="text-[13px] text-danger" role="alert" data-test="folder-new-issue">{{ props.reason }}</span>
  </form>
</template>

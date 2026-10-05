<script setup lang="ts">
import { z } from '@kvman/sdk';
import { KeyRound, Plus } from '@lucide/vue';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useQuery } from '../../composables/use-query.ts';
import { runCommand } from '../../state/commands.ts';
import { showProblem, useKvwebui } from '../../state/kvwebui.ts';

// An extension's secrets (plan 06 §6.6, ADR 0014, 6): their names, masked, with Delete after a confirmation, and
// "Add a secret" with a password field. A secret's value is never shown or kept after it's sent.
const props = defineProps<{ extension: string }>();
const state = useKvwebui();
const { t } = useI18n();
const { data } = useQuery(() => 'kernel.secrets.list', () => ({}));
const secrets = computed(() => (z.array(z.object({ extension: z.string(), name: z.string() })).safeParse(data.value).data ?? []).filter((secret) => secret.extension === props.extension));
const adding = ref(false);
const name = ref('');
const value = ref('');

const remove = async (secret: { extension: string; name: string }): Promise<void> => {
  if (!(await state.confirmations.ask('kvwebui.secrets.deleteConfirm', { name: secret.name }, true))) return;
  await runCommand(state, 'kernel.secrets.delete', secret, (outcome) => {
    if (!outcome.ok) showProblem(state, outcome.problem);
  });
};
const add = async (): Promise<void> => {
  await runCommand(state, 'kernel.secrets.set', { extension: props.extension, name: name.value.trim(), value: value.value }, (outcome) => {
    if (!outcome.ok) return showProblem(state, outcome.problem);
    adding.value = false;
    name.value = '';
    value.value = '';
    state.toasts.show({ text: 'kvwebui.secrets.saved', params: {}, level: 'success' });
  });
};
</script>

<template>
  <section class="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5" data-test="secrets">
    <h2 class="m-0 text-base font-semibold">{{ t('kvwebui.secrets.title') }}</h2>
    <p class="m-0 text-muted">{{ t('kvwebui.secrets.intro') }}</p>
    <div v-for="secret in secrets" :key="`${secret.extension}/${secret.name}`" class="flex items-center gap-3" data-test="secret">
      <KeyRound class="size-4.5 shrink-0 text-muted" aria-hidden="true" />
      <span dir="ltr" class="grow font-mono text-[13px]" data-test="secret-name-shown">{{ secret.name }}</span>
      <span class="font-mono tracking-widest text-muted" aria-hidden="true">••••••••</span>
      <button type="button" class="h-8 rounded-lg border border-line bg-surface px-3 text-[13px] font-medium text-danger" :data-test="`secret-delete-${secret.name}`" @click="remove(secret)">
        {{ t('kvwebui.secrets.delete') }}
      </button>
    </div>
    <p v-if="secrets.length === 0" class="m-0 text-muted">{{ t('kvwebui.secrets.none') }}</p>
    <form v-if="adding" class="flex flex-col gap-3 rounded-xl border border-line p-4" data-test="secret-form" @submit.prevent="add">
      <label class="flex flex-col gap-1.5">
        <span class="font-medium">{{ t('kvwebui.secrets.name') }}</span>
        <input v-model="name" type="text" required dir="ltr" class="h-10 rounded-xl border border-line bg-surface px-3 font-mono text-[13px]" data-test="secret-name" />
      </label>
      <label class="flex flex-col gap-1.5">
        <span class="font-medium">{{ t('kvwebui.secrets.value') }}</span>
        <input v-model="value" type="password" autocomplete="off" required class="h-10 rounded-xl border border-line bg-surface px-3" data-test="secret-value" />
      </label>
      <div class="flex justify-end gap-2.5">
        <button type="button" class="h-9 rounded-xl border border-line bg-surface px-3.5 font-medium" @click="adding = false">{{ t('kvwebui.cancel') }}</button>
        <button type="submit" class="h-9 rounded-xl bg-primary px-3.5 font-medium text-on-primary" data-test="secret-save">{{ t('kvwebui.secrets.save') }}</button>
      </div>
    </form>
    <button v-else type="button" class="flex h-8.5 w-fit items-center gap-2 rounded-xl border border-line bg-surface px-3 font-medium" data-test="secret-add" @click="adding = true">
      <Plus class="size-4" aria-hidden="true" />{{ t('kvwebui.secrets.add') }}
    </button>
  </section>
</template>

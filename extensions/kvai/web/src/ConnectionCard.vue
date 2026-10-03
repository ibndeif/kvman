<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import ConnectionActions from './ConnectionActions.vue';
import ConnectionBadge from './ConnectionBadge.vue';
import KeyForm from './KeyForm.vue';
import SigninPanel from './SigninPanel.vue';
import { failureOf, fields, useKvman } from './kvman.ts';
import { useSignin } from './use-signin.ts';

// The provider connection card (plan 07 §7.3, ADR 0009, 237): how the provider is connected, the key form, the plan
// sign-in, Disconnect, and Remove provider for a custom one.
const props = defineProps<{ providerId: string }>();
const kvman = useKvman();

type ProviderRow = {
  id: string;
  title: string;
  builtIn: boolean;
  status: string;
  models: number;
  connection: 'apiKey' | 'oauth' | null;
  signIn: boolean;
  apiKey: boolean;
};

function asRow(value: unknown): ProviderRow | undefined {
  const row = fields(value);
  const { id, title, builtIn, status, models, connection, signIn, apiKey } = row;
  if (typeof id !== 'string' || typeof title !== 'string' || typeof builtIn !== 'boolean') return undefined;
  if (typeof status !== 'string' || typeof models !== 'number') return undefined;
  if (connection !== 'apiKey' && connection !== 'oauth' && connection !== null) return undefined;
  if (typeof signIn !== 'boolean' || typeof apiKey !== 'boolean') return undefined;
  return { id, title, builtIn, status, models, connection, signIn, apiKey };
}

const row = ref<ProviderRow | null>(null);
const loading = ref(true);
const loadFailure = ref<string | null>(null);
const loadParams = ref<Record<string, string>>({});

async function read(): Promise<void> {
  loading.value = true;
  loadFailure.value = null;
  loadParams.value = {};
  try {
    const answer = await kvman.exec('kvai.provider.get', { id: props.providerId });
    const parsed = asRow(answer);
    if (parsed === undefined) throw new Error(`Unexpected provider row for ${props.providerId}.`);
    row.value = parsed;
  } catch (error) {
    const { key, params } = failureOf(error);
    loadFailure.value = key;
    loadParams.value = params;
    row.value = null;
  } finally {
    loading.value = false;
  }
}

const signin = useSignin(kvman, () => props.providerId, read);

onMounted(read);
watch(
  () => props.providerId,
  () => {
    if (signin.active() || signin.starting()) void signin.cancel();
    void read();
  },
);
</script>

<template>
  <section class="kvai-card" data-test="connection-card" :aria-label="kvman.t('kvai.ui.connection.title')">
    <h2 class="kvai-title">{{ kvman.t('kvai.ui.connection.title') }}</h2>
    <p v-if="loading" class="kvai-text" data-test="connection-loading">{{ kvman.t('kvai.ui.connection.loading') }}</p>
    <p v-else-if="loadFailure !== null" class="kvai-error" data-test="connection-error" role="alert">
      {{ kvman.t(loadFailure, loadParams) }}
    </p>
    <template v-else-if="row !== null">
      <ConnectionBadge :connection="row.connection" :built-in="row.builtIn" />
      <KeyForm v-if="row.apiKey && !signin.active() && !signin.starting()" :provider="row.id" :on-saved="read" />
      <div v-if="row.signIn && !signin.active() && !signin.starting()" class="kvai-field">
        <div class="kvai-actions">
          <button type="button" class="kvai-button kvai-primary" data-test="signin-button" @click="signin.start">
            {{ kvman.t('kvai.ui.connection.signin') }}
          </button>
        </div>
        <p class="kvai-text kvai-muted" data-test="signin-terms">{{ kvman.t('kvai.ui.connection.signinTerms') }}</p>
        <p v-if="signin.failure() !== null" class="kvai-error" data-test="signin-error" role="alert">
          {{ kvman.t(signin.failure() ?? '', signin.failureParams()) }}
        </p>
      </div>
      <SigninPanel v-if="signin.active() || signin.starting()" :signin="signin" />
      <ConnectionActions
        v-if="!signin.active() && !signin.starting()"
        :provider="row.id"
        :title="row.title"
        :connected="row.connection !== null"
        :built-in="row.builtIn"
        :on-changed="read"
      />
    </template>
  </section>
</template>

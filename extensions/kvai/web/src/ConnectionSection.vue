<script setup lang="ts">
import { ref } from 'vue';
import ConnectedCard from './ConnectedCard.vue';
import KeyChoice from './KeyChoice.vue';
import PlanChoice from './PlanChoice.vue';
import RemoveProvider from './RemoveProvider.vue';
import SigninProgress from './SigninProgress.vue';
import { useKvman } from './kvman.ts';
import type { ProviderRow } from './provider-row.ts';
import { useSignin } from './use-signin.ts';

// The Provider page's connection section (plan 07 §7.3, ADR 0009, 246): two choices when not connected, a
// connected card with the other method behind a button, and the sign-in progress panel. The row comes from
// `ProviderPage`, which reloads it after a change; switching providers unmounts the section (through its key),
// which cancels a running sign-in.
const props = defineProps<{ row: ProviderRow; onChanged: () => Promise<void> }>();
const kvman = useKvman();

const signin = useSignin(kvman, () => props.row.id, () => props.onChanged());
const showKeyChoice = ref(false);

function signing(): boolean {
  return signin.active() || signin.starting();
}

async function startSignin(): Promise<void> {
  await signin.start();
}

async function revealKey(): Promise<void> {
  showKeyChoice.value = true;
}
</script>

<template>
  <section class="kvai-card kvai-connection" data-test="connection-section" :aria-label="kvman.t('kvai.ui.provider.title')">
    <SigninProgress v-if="signing()" :signin="signin" />
    <template v-else-if="row.connection === null">
      <div class="kvai-field">
        <h2 class="kvai-section-title">{{ kvman.t('kvai.ui.provider.connectTitle', { title: row.title }) }}</h2>
        <p class="kvai-text kvai-muted">{{ kvman.t('kvai.ui.provider.connectHelp', { title: row.title }) }}</p>
      </div>
      <p v-if="!row.builtIn" class="kvai-text kvai-muted">{{ kvman.t('kvai.ui.connection.noKeyLocal') }}</p>
      <div class="kvai-choices" data-test="choices">
        <PlanChoice v-if="row.signIn" :on-signin="startSignin" />
        <KeyChoice v-if="row.apiKey" :provider="row.id" :on-saved="onChanged" />
      </div>
      <p v-if="signin.failure() !== null" class="kvai-error" data-test="signin-error" role="alert">
        {{ kvman.t(signin.failure() ?? '', signin.failureParams()) }}
      </p>
    </template>
    <template v-else>
      <ConnectedCard :row="row" :on-changed="onChanged" />
      <div v-if="row.connection === 'oauth' && row.apiKey" class="kvai-other">
        <p class="kvai-text kvai-muted">{{ kvman.t('kvai.ui.provider.preferKey') }}</p>
        <div class="kvai-actions">
          <button type="button" class="kvai-button" data-test="other-key" @click="revealKey">
            {{ kvman.t('kvai.ui.provider.useKey') }}
          </button>
        </div>
        <KeyChoice v-if="showKeyChoice" :provider="row.id" :on-saved="onChanged" />
      </div>
      <div v-if="row.connection === 'apiKey' && row.signIn" class="kvai-other">
        <p class="kvai-text kvai-muted">{{ kvman.t('kvai.ui.provider.preferPlan') }}</p>
        <div class="kvai-actions">
          <button type="button" class="kvai-button" data-test="signin-button" @click="startSignin">
            {{ kvman.t('kvai.ui.connection.signin') }}
          </button>
        </div>
        <p class="kvai-text kvai-muted" data-test="signin-terms">{{ kvman.t('kvai.ui.connection.signinTerms') }}</p>
        <p v-if="signin.failure() !== null" class="kvai-error" data-test="signin-error" role="alert">
          {{ kvman.t(signin.failure() ?? '', signin.failureParams()) }}
        </p>
      </div>
    </template>
    <RemoveProvider v-if="!row.builtIn && !signing()" :id="row.id" :title="row.title" />
  </section>
</template>

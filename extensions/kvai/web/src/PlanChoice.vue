<script setup lang="ts">
import { useKvman } from './kvman.ts';

// The plan choice (ADR 0009, 246): "Your plan" with the sign-in button and the terms note.
defineProps<{ onSignin: () => Promise<void> }>();
const kvman = useKvman();
</script>

<template>
  <div class="kvai-choice kvai-choice-plan" data-test="choice-plan" data-highlight="true">
    <h3 class="kvai-choice-title">{{ kvman.t('kvai.ui.provider.planChoice') }}</h3>
    <p class="kvai-text kvai-muted">{{ kvman.t('kvai.ui.provider.planHelp2') }}</p>
    <div class="kvai-actions">
      <button type="button" class="kvai-button kvai-primary" data-test="signin-button" @click="onSignin">
        {{ kvman.t('kvai.ui.connection.signin') }}
      </button>
    </div>
    <p class="kvai-text kvai-muted" data-test="signin-terms">{{ kvman.t('kvai.ui.connection.signinTerms') }}</p>
  </div>
</template>

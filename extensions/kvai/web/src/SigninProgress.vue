<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { isWebUrl } from './signin-chunks.ts';
import { useKvman } from './kvman.ts';
import type { useSignin } from './use-signin.ts';

// The sign-in progress panel (ADR 0009, 246): the spinner row, the sign-in link, the device code, the
// provider's prompt, "Working…", Cancel, and failures. Chunk handling lives in `use-signin.ts`.
const props = defineProps<{ signin: ReturnType<typeof useSignin> }>();
const kvman = useKvman();
const draft = ref('');
const sending = ref(false);

const options = computed(() => {
  const current = props.signin.prompt();
  return current !== null && current.kind === 'select' ? current.options : [];
});

const placeholder = computed(() => {
  const current = props.signin.prompt();
  if (current !== null && (current.kind === 'text' || current.kind === 'manual_code')) return current.placeholder ?? '';
  return '';
});

const hasChunk = computed(
  () =>
    props.signin.authUrl() !== null ||
    props.signin.device() !== null ||
    props.signin.prompt() !== null ||
    props.signin.working(),
);

const authLink = computed(() => {
  const url = props.signin.authUrl();
  return url !== null && isWebUrl(url) ? url : null;
});

watch(
  () => props.signin.prompt(),
  () => {
    draft.value = '';
    sending.value = false;
  },
);

async function send(): Promise<void> {
  if (sending.value) return;
  sending.value = true;
  try {
    await props.signin.sendText(draft.value);
  } finally {
    sending.value = false;
  }
}
</script>

<template>
  <div class="kvai-signin" data-test="signin-panel">
    <div class="kvai-progress-row">
      <span class="kvai-spinner" aria-hidden="true"></span>
      <div class="kvai-stack">
        <template v-if="authLink !== null">
          <h3 class="kvai-choice-title">{{ kvman.t('kvai.ui.provider.finishTitle') }}</h3>
          <p class="kvai-text kvai-muted">{{ kvman.t('kvai.ui.provider.finishHelp') }}</p>
          <p class="kvai-text">
            <a data-test="signin-link" :href="authLink" target="_blank" rel="noopener noreferrer">{{
              kvman.t('kvai.ui.provider.openAgain')
            }}</a>
          </p>
        </template>
        <p v-else-if="!hasChunk" class="kvai-text" data-test="signin-starting" role="status">
          {{ kvman.t('kvai.ui.provider.starting') }}
        </p>
      </div>
    </div>
    <div v-if="signin.device() !== null" class="kvai-field">
      <p class="kvai-text mono" data-test="device-code">
        <span class="kvai-mono">{{ signin.device()?.userCode }}</span>
      </p>
      <p class="kvai-text">
        {{ kvman.t('kvai.ui.connection.enterCodeAt') }}
        <a
          v-if="isWebUrl(signin.device()?.verificationUri ?? '')"
          data-test="device-link"
          :href="signin.device()?.verificationUri"
          target="_blank"
          rel="noopener noreferrer"
          >{{ signin.device()?.verificationUri }}</a
        >
      </p>
    </div>
    <div v-if="signin.prompt() !== null" class="kvai-field">
      <template v-if="signin.prompt()?.kind === 'select'">
        <p class="kvai-text" data-test="prompt-message">{{ signin.prompt()?.message }}</p>
        <div class="kvai-actions kvai-column">
          <button
            v-for="option in options"
            :key="option.id"
            type="button"
            class="kvai-button"
            :data-test="`prompt-option-${option.id}`"
            @click="signin.sendOption(option.id)"
          >
            <span>{{ option.label }}</span>
            <span v-if="option.description" class="kvai-muted">{{ option.description }}</span>
          </button>
        </div>
      </template>
      <template v-else>
        <label class="kvai-label" for="kvai-answer" data-test="prompt-message">{{ signin.prompt()?.message }}</label>
        <input
          id="kvai-answer"
          v-model="draft"
          data-test="prompt-input"
          class="kvai-input"
          type="text"
          :placeholder="placeholder"
        />
        <p v-if="signin.prompt()?.kind === 'manual_code'" class="kvai-text kvai-muted" data-test="prompt-manual-help">
          {{ kvman.t('kvai.ui.connection.manualCodeHelp') }}
        </p>
        <div class="kvai-actions">
          <button type="button" class="kvai-button kvai-primary" data-test="prompt-send" :disabled="sending" @click="send">
            {{ kvman.t('kvai.ui.connection.send') }}
          </button>
        </div>
      </template>
    </div>
    <p v-if="signin.working()" class="kvai-text" data-test="signin-working" role="status">
      {{ kvman.t('kvai.ui.connection.working') }}
    </p>
    <p v-if="signin.failure() !== null" class="kvai-error" data-test="signin-error" role="alert">
      {{ kvman.t(signin.failure() ?? '', signin.failureParams()) }}
    </p>
    <div class="kvai-actions">
      <button type="button" class="kvai-button" data-test="signin-cancel" @click="signin.cancel">
        {{ kvman.t('kvai.ui.connection.cancel') }}
      </button>
    </div>
  </div>
</template>

import { onUnmounted, ref } from 'vue';
import type { Kvman } from '@kvman/sdk/web';
import { asAuthUrl, asDeviceCode, asPrompt, isProgressTick, type DeviceCodeChunk, type PromptChunk } from './signin-chunks.ts';
import { failureOf, problemOf } from './kvman.ts';

// Runs one plan sign-in for the card (plan 07 §7.2, ADR 0009, 230): `execAsync` then the job's stream, keeping the
// latest chunk to show. Only one sign-in runs at a time in a card; unmount cancels a running one.
export function useSignin(kvman: Kvman, providerOf: () => string, refreshed: () => Promise<void>): {
  active: () => boolean;
  starting: () => boolean;
  authUrl: () => string | null;
  device: () => DeviceCodeChunk | null;
  prompt: () => PromptChunk | null;
  working: () => boolean;
  failure: () => string | null;
  failureParams: () => Record<string, string>;
  start: () => Promise<void>;
  sendText: (answer: string) => Promise<void>;
  sendOption: (id: string) => Promise<void>;
  cancel: () => Promise<void>;
} {
  const running = ref(false);
  const starting = ref(false);
  const authUrl = ref<string | null>(null);
  const device = ref<DeviceCodeChunk | null>(null);
  const prompt = ref<PromptChunk | null>(null);
  const working = ref(false);
  const failure = ref<string | null>(null);
  const failureParams = ref<Record<string, string>>({});
  let provider = '';

  function reset(): void {
    authUrl.value = null;
    device.value = null;
    prompt.value = null;
    working.value = false;
  }

  function showFailure(error: unknown): void {
    const shown = problemOf(error);
    if (shown !== undefined && shown.code === 'CANCELLED') {
      failure.value = null;
      failureParams.value = {};
      return;
    }
    const { key, params } = failureOf(error);
    failure.value = key;
    failureParams.value = params;
  }

  async function follow(id: string): Promise<void> {
    for await (const event of kvman.stream(id)) {
      if (event.type === 'progress') {
        if (event.source !== '@kvman/kvai') continue;
        const url = asAuthUrl(event.data);
        if (url !== undefined) {
          authUrl.value = url.url;
          continue;
        }
        const code = asDeviceCode(event.data);
        if (code !== undefined) {
          device.value = code;
          continue;
        }
        const asked = asPrompt(event.data);
        if (asked !== undefined) {
          prompt.value = asked;
          continue;
        }
        if (isProgressTick(event.data)) working.value = true;
        continue;
      }
      if (event.type === 'result') {
        await refreshed();
        kvman.refresh();
        kvman.toast('kvai.ui.connection.signedIn', {}, 'success');
        return;
      }
      showFailure(Object.assign(new Error(event.problem.message), { problem: event.problem }));
      return;
    }
  }

  async function start(): Promise<void> {
    if (running.value || starting.value) return;
    starting.value = true;
    failure.value = null;
    failureParams.value = {};
    reset();
    provider = providerOf();
    let id: string;
    try {
      id = await kvman.execAsync('kvai.provider.signin.start', { provider });
    } catch (error) {
      starting.value = false;
      showFailure(error);
      return;
    }
    running.value = true;
    starting.value = false;
    try {
      await follow(id);
    } catch (error) {
      showFailure(error);
    } finally {
      running.value = false;
    }
  }

  async function answer(answer: string): Promise<void> {
    failure.value = null;
    failureParams.value = {};
    try {
      await kvman.exec('kvai.provider.signin.answer', { provider, answer });
      prompt.value = null;
    } catch (error) {
      showFailure(error);
    }
  }

  async function cancel(): Promise<void> {
    if (!running.value && !starting.value) return;
    const activeProvider = provider;
    try {
      await kvman.exec('kvai.provider.signin.cancel', { provider: activeProvider });
    } catch (error) {
      showFailure(error);
    }
  }

  onUnmounted(() => {
    if (running.value || starting.value) void cancel();
  });

  return {
    active: () => running.value,
    starting: () => starting.value,
    authUrl: () => authUrl.value,
    device: () => device.value,
    prompt: () => prompt.value,
    working: () => working.value,
    failure: () => failure.value,
    failureParams: () => failureParams.value,
    start,
    sendText: (answerText: string) => answer(answerText),
    sendOption: (id: string) => answer(id),
    cancel,
  };
}

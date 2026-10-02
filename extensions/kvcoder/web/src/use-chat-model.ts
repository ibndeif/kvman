import { computed, onMounted, ref } from 'vue';
import type { Kvman } from '@kvman/sdk/web';
import { modelGroups, thinkingLevels, type ModelRow, type ProviderRow, type Thinking } from './model-groups.ts';

// The model and thinking level a new chat would use, and whether the model can be called (plan 08 §8.7, ADR 0009,
// 194): `kvcoder.model`, or `kvai.defaultModel` when that is `null`, and `kvcoder.thinking`, unless the person picked
// others for this chat.
export type StartState = 'loading' | 'ready' | 'needsKey' | 'noModel';

function modelSetting(settings: readonly { key: string; value: unknown }[], key: string): string | null {
  const value = settings.find((setting) => setting.key === key)?.value;
  return typeof value === 'string' && value !== '' ? value : null;
}

function thinkingSetting(settings: readonly { key: string; value: unknown }[]): Thinking {
  const value = settings.find((setting) => setting.key === 'kvcoder.thinking')?.value;
  return thinkingLevels.find((level) => level === value) ?? 'medium';
}

export function useChatModel(kvman: Kvman, failed: (error: unknown) => void) {
  const providers = ref<ProviderRow[]>([]);
  const models = ref<ModelRow[]>([]);
  const configured = ref<string | null>(null);
  const picked = ref<string | null>(null);
  const configuredThinking = ref<Thinking>('medium');
  const pickedThinking = ref<Thinking | null>(null);
  const loaded = ref(false);
  const loadFailed = ref(false);

  onMounted(async () => {
    try {
      const [settings, providerRows, modelRows] = await Promise.all([kvman.exec('kernel.settings.list', {}), kvman.exec('kvai.provider.list', {}), kvman.exec('kvai.model.list', {})]);
      configured.value = modelSetting(settings, 'kvcoder.model') ?? modelSetting(settings, 'kvai.defaultModel');
      configuredThinking.value = thinkingSetting(settings);
      providers.value = providerRows;
      models.value = modelRows;
    } catch (error) {
      loadFailed.value = true;
      failed(error);
    } finally {
      loaded.value = true;
    }
  });

  const current = computed(() => picked.value ?? configured.value);
  const thinking = computed(() => pickedThinking.value ?? configuredThinking.value);
  const groups = computed(() => modelGroups(providers.value, models.value, current.value));
  const provider = computed(() => providers.value.find((row) => row.id === models.value.find((model) => model.id === current.value)?.provider));
  const state = computed<StartState>(() => {
    if (!loaded.value) return 'loading';
    if (loadFailed.value) return 'ready';
    if (current.value === null) return 'noModel';
    return provider.value?.status === 'needsKey' ? 'needsKey' : 'ready';
  });

  /** What the person changed for this chat, as `kvcoder.session.configure` takes it. */
  const changes = (): { model?: string; thinking?: Thinking } => ({ ...(picked.value === null ? {} : { model: picked.value }), ...(pickedThinking.value === null ? {} : { thinking: pickedThinking.value }) });

  return {
    current,
    thinking,
    groups,
    provider,
    state,
    changes,
    pickModel: (modelId: string): void => void (picked.value = modelId),
    pickThinking: (level: Thinking): void => void (pickedThinking.value = level),
  };
}

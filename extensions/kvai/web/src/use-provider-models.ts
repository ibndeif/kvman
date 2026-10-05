import { computed, onMounted, ref, watch, type ComputedRef, type Ref } from 'vue';
import { setDefaultModel } from './default-model.ts';
import { failureOf, fields, useKvman } from './kvman.ts';

// A model row of `kvai.model.list` as the provider's models list needs it (plan 07 §7.2).
export type ProviderModel = {
  id: string;
  name: string;
  reasoning: boolean;
  contextWindow: number;
  isDefault: boolean;
};

// At most this many models show before "Show 25 more".
export const providerModelsPageSize = 25;

function asModel(value: unknown): ProviderModel | undefined {
  const row = fields(value);
  const { id, name, reasoning, contextWindow, isDefault } = row;
  if (typeof id !== 'string' || typeof name !== 'string') return undefined;
  if (typeof reasoning !== 'boolean' || typeof contextWindow !== 'number') return undefined;
  if (typeof isDefault !== 'boolean') return undefined;
  return { id, name, reasoning, contextWindow, isDefault };
}

function asModels(value: unknown): ProviderModel[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const models: ProviderModel[] = [];
  for (const item of value) {
    const model = asModel(item);
    if (model === undefined) return undefined;
    models.push(model);
  }
  return models;
}

// The provider's models (plan 07 §7.3, ADR 0009, 247): A–Z by name, with search, "Show 25 more", and "Make
// default". A failed "Make default" shows its reason and leaves the rows.
export function useProviderModels(providerId: () => string): {
  models: Ref<ProviderModel[]>;
  loading: Ref<boolean>;
  making: Ref<boolean>;
  failure: Ref<{ key: string; params: Record<string, string> } | null>;
  search: Ref<string>;
  visible: ComputedRef<ProviderModel[]>;
  hasMore: ComputedRef<boolean>;
  noMatch: ComputedRef<boolean>;
  more: () => void;
  reload: () => Promise<void>;
  makeDefault: (modelId: string) => Promise<void>;
} {
  const kvman = useKvman();
  const models = ref<ProviderModel[]>([]);
  const loading = ref(true);
  const making = ref(false);
  const failure = ref<{ key: string; params: Record<string, string> } | null>(null);
  const search = ref('');
  const shown = ref(providerModelsPageSize);

  const matched = computed(() => {
    const needle = search.value.trim().toLocaleLowerCase();
    const sorted = [...models.value].sort((left, right) => left.name.localeCompare(right.name));
    if (needle === '') return sorted;
    return sorted.filter(
      (model) => model.name.toLocaleLowerCase().includes(needle) || model.id.toLocaleLowerCase().includes(needle),
    );
  });
  const visible = computed(() => matched.value.slice(0, shown.value));
  const hasMore = computed(() => matched.value.length > shown.value);
  const noMatch = computed(() => !loading.value && models.value.length > 0 && matched.value.length === 0);

  async function reload(): Promise<void> {
    loading.value = true;
    try {
      const answer = await kvman.exec('kvai.model.list', { provider: providerId() });
      const parsed = asModels(answer);
      if (parsed === undefined) throw new Error(`Unexpected model list answer for ${providerId()}.`);
      models.value = parsed;
    } catch (error) {
      failure.value = failureOf(error);
      models.value = [];
    } finally {
      loading.value = false;
    }
  }

  async function makeDefault(modelId: string): Promise<void> {
    if (making.value) return;
    making.value = true;
    failure.value = null;
    try {
      await setDefaultModel(kvman, modelId, 'global');
      await reload();
      kvman.refresh();
    } catch (error) {
      failure.value = failureOf(error);
    } finally {
      making.value = false;
    }
  }

  function more(): void {
    shown.value += providerModelsPageSize;
  }

  watch(search, () => {
    shown.value = providerModelsPageSize;
  });

  watch(providerId, () => {
    search.value = '';
    shown.value = providerModelsPageSize;
    void reload();
  });

  onMounted(reload);
  return { models, loading, making, failure, search, visible, hasMore, noMatch, more, reload, makeDefault };
}

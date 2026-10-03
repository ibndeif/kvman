import { onMounted, ref, type Ref } from 'vue';
import { failureOf, fields, useKvman } from './kvman.ts';
import type { DefaultModel, ProviderRow } from './provider-groups.ts';

// Loads `kvai.provider.list` and `kvai.model.default.get` together for the Models page (plan 07 §7.3, ADR 0009, 238).
export function useProviders(): {
  rows: Ref<ProviderRow[]>;
  defaultModel: Ref<DefaultModel | null>;
  loading: Ref<boolean>;
  failure: Ref<{ key: string; params: Record<string, string> } | null>;
  reload: () => Promise<void>;
} {
  const kvman = useKvman();
  const rows = ref<ProviderRow[]>([]);
  const defaultModel = ref<DefaultModel | null>(null);
  const loading = ref(true);
  const failure = ref<{ key: string; params: Record<string, string> } | null>(null);

  function asRow(value: unknown): ProviderRow | undefined {
    const row = fields(value);
    const { id, title, builtIn, status, models, connection, signIn, apiKey } = row;
    if (typeof id !== 'string' || typeof title !== 'string' || typeof builtIn !== 'boolean') return undefined;
    if (typeof status !== 'string' || typeof models !== 'number') return undefined;
    if (connection !== 'apiKey' && connection !== 'oauth' && connection !== null) return undefined;
    if (typeof signIn !== 'boolean' || typeof apiKey !== 'boolean') return undefined;
    return { id, title, builtIn, status, models, connection, signIn, apiKey };
  }

  function asRows(value: unknown): ProviderRow[] | undefined {
    if (!Array.isArray(value)) return undefined;
    const parsed = value.map(asRow);
    return parsed.includes(undefined) ? undefined : (parsed as ProviderRow[]);
  }

  function asDefault(value: unknown): DefaultModel | undefined {
    const row = fields(value);
    const { id, name, ready } = row;
    if (id !== null && typeof id !== 'string') return undefined;
    if (name !== null && typeof name !== 'string') return undefined;
    if (typeof ready !== 'boolean') return undefined;
    return { id, name, ready };
  }

  async function reload(): Promise<void> {
    loading.value = true;
    failure.value = null;
    try {
      const [listed, current] = await Promise.all([kvman.exec('kvai.provider.list', {}), kvman.exec('kvai.model.default.get', {})]);
      const parsedRows = asRows(listed);
      const parsedDefault = asDefault(current);
      if (parsedRows === undefined || parsedDefault === undefined) throw new Error('Unexpected providers answer.');
      rows.value = parsedRows;
      defaultModel.value = parsedDefault;
    } catch (error) {
      failure.value = failureOf(error);
      rows.value = [];
      defaultModel.value = null;
    } finally {
      loading.value = false;
    }
  }

  onMounted(reload);
  return { rows, defaultModel, loading, failure, reload };
}

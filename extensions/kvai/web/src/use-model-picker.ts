import { computed, ref } from 'vue';
import { failureOf, fields, useKvman } from './kvman.ts';
import { callableRows, groupByProvider, matchModels, type PickerModel } from './picker-models.ts';
import type { ProviderRow } from './provider-groups.ts';

export type PickerFailure = {
  provider: string;
  title: string;
  failure: { key: string; params: Record<string, string> };
};

function asModel(value: unknown, provider: string): PickerModel | undefined {
  const { id, name } = fields(value);
  if (typeof id !== 'string' || typeof name !== 'string') return undefined;
  return { id, name, provider };
}

function asModels(value: unknown, provider: string): PickerModel[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const models: PickerModel[] = [];
  for (const item of value) {
    const model = asModel(item, provider);
    if (model === undefined) return undefined;
    models.push(model);
  }
  return models;
}

// The model picker (plan 07 §7.3, ADR 0009, 244; ADR 0015, 2): opens under its button and lists every model of the
// callable providers, as the chat's picker does: every word typed must be in a model's name or id, the highlight starts
// on the current model, and the arrows wrap. Each provider is read on its own, so one failing provider doesn't hide the
// others. `pick` stores the choice; a failed pick stays open with its reason.
export function useModelPicker(options: { providers: () => readonly ProviderRow[]; current: () => string | null; pick: (modelId: string) => Promise<void> }) {
  const kvman = useKvman();
  const open = ref(false);
  const query = ref('');
  const highlighted = ref(0);
  const loading = ref(false);
  const picking = ref(false);
  const pickError = ref<{ key: string; params: Record<string, string> } | null>(null);
  const failures = ref<PickerFailure[]>([]);
  const loaded = ref<PickerModel[]>([]);
  const titles = ref(new Map<string, string>());

  const current = computed(() => options.current());
  const callableCount = computed(() => callableRows(options.providers()).length);
  const groups = computed(() => groupByProvider(matchModels(loaded.value, query.value), titles.value));
  const shown = computed(() => groups.value.flatMap((group) => group.models));
  const total = computed(() => loaded.value.length);

  async function readModels(row: ProviderRow): Promise<{ row: ProviderRow; models: PickerModel[]; failure: PickerFailure['failure'] | null }> {
    try {
      const models = asModels(await kvman.exec('kvai.model.list', { provider: row.id }), row.id);
      if (models === undefined) throw new Error('Unexpected model list answer.');
      return { row, models, failure: null };
    } catch (error) {
      return { row, models: [], failure: failureOf(error) };
    }
  }

  async function openPicker(): Promise<void> {
    open.value = true;
    query.value = '';
    highlighted.value = 0;
    pickError.value = null;
    failures.value = [];
    loaded.value = [];
    loading.value = true;
    try {
      const callable = callableRows(options.providers());
      titles.value = new Map(callable.map((row) => [row.id, row.title]));
      const settled = await Promise.all(callable.map(readModels));
      loaded.value = settled.flatMap((entry) => entry.models);
      failures.value = settled.flatMap((entry) => (entry.failure === null ? [] : [{ provider: entry.row.id, title: entry.row.title, failure: entry.failure }]));
      highlighted.value = Math.max(shown.value.findIndex((model) => model.id === current.value), 0);
    } finally {
      loading.value = false;
    }
  }

  function closePicker(): void {
    open.value = false;
  }

  function togglePicker(): void {
    if (open.value) closePicker();
    else void openPicker();
  }

  function setQuery(value: string): void {
    query.value = value;
    highlighted.value = 0;
  }

  function setHighlight(index: number): void {
    highlighted.value = index;
  }

  function moveHighlight(step: number): void {
    const count = shown.value.length;
    if (count > 0) highlighted.value = (highlighted.value + step + count) % count;
  }

  async function pickModel(modelId: string): Promise<void> {
    if (picking.value) return;
    picking.value = true;
    pickError.value = null;
    try {
      await options.pick(modelId);
      open.value = false;
    } catch (error) {
      pickError.value = failureOf(error);
    } finally {
      picking.value = false;
    }
  }

  return { open, query, highlighted, loading, picking, pickError, failures, groups, shown, total, callableCount, current, openPicker, closePicker, togglePicker, setQuery, setHighlight, moveHighlight, pickModel };
}

/** The picker's state, passed from its button's component to the popover. */
export type ModelPickerState = ReturnType<typeof useModelPicker>;

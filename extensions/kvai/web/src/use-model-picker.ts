import { computed, ref, type ComputedRef, type Ref } from 'vue';
import { setDefaultModel } from './default-model.ts';
import { failureOf, fields, useKvman } from './kvman.ts';
import { callableRows, groupByProvider, limitModels, matchModels, type PickerGroup, type PickerModel } from './picker-models.ts';
import type { ProviderRow } from './provider-groups.ts';

// At most this many models show in the picker (ADR 0009, 244).
const pickerLimit = 100;

export type PickerFailure = {
  provider: string;
  title: string;
  failure: { key: string; params: Record<string, string> };
};

function asModel(value: unknown, provider: string): PickerModel | undefined {
  const row = fields(value);
  const { id, name } = row;
  if (typeof id !== 'string' || typeof name !== 'string') return undefined;
  return { id, name, provider, isDefault: row['isDefault'] === true };
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

// The "Change model" picker (plan 07 §7.3, ADR 0009, 244): opens under the default card's button and lists every
// model of the callable providers. Each provider is read on its own, so one failing provider doesn't hide the
// others. Picking writes the global setting; a failed pick stays open with its reason.
export function useModelPicker(options: {
  providers: () => readonly ProviderRow[];
  defaultId: () => string | null;
  onPicked: () => Promise<void>;
}): {
  open: Ref<boolean>;
  query: Ref<string>;
  highlighted: Ref<number>;
  loading: Ref<boolean>;
  picking: Ref<boolean>;
  pickError: Ref<{ key: string; params: Record<string, string> } | null>;
  failures: Ref<PickerFailure[]>;
  groups: ComputedRef<PickerGroup[]>;
  shown: ComputedRef<PickerModel[]>;
  hidden: ComputedRef<number>;
  callableCount: ComputedRef<number>;
  defaultId: ComputedRef<string | null>;
  openPicker: () => Promise<void>;
  closePicker: () => void;
  togglePicker: () => void;
  setQuery: (value: string) => void;
  moveHighlight: (delta: number) => void;
  pickModel: (modelId: string) => Promise<void>;
} {
  const kvman = useKvman();
  const open = ref(false);
  const query = ref('');
  const highlighted = ref(-1);
  const loading = ref(false);
  const picking = ref(false);
  const pickError = ref<{ key: string; params: Record<string, string> } | null>(null);
  const failures = ref<PickerFailure[]>([]);
  const loaded = ref<PickerModel[]>([]);
  const titles = ref(new Map<string, string>());

  const defaultId = computed(() => options.defaultId());
  const callableCount = computed(() => callableRows(options.providers()).length);
  const matched = computed(() => matchModels(loaded.value, query.value));
  const limited = computed(() => limitModels(matched.value, pickerLimit));
  const groups = computed(() => groupByProvider(limited.value.shown, titles.value));
  const shown = computed(() => groups.value.flatMap((group) => group.models));
  const hidden = computed(() => limited.value.hidden);

  async function openPicker(): Promise<void> {
    open.value = true;
    query.value = '';
    highlighted.value = -1;
    pickError.value = null;
    failures.value = [];
    loaded.value = [];
    loading.value = true;
    try {
      const callable = callableRows(options.providers());
      titles.value = new Map(callable.map((row) => [row.id, row.title]));
      const settled = await Promise.all(
        callable.map(async (row) => {
          try {
            const answer = await kvman.exec('kvai.model.list', { provider: row.id });
            const models = asModels(answer, row.id);
            if (models === undefined) throw new Error('Unexpected model list answer.');
            return { row, models, failure: null as PickerFailure['failure'] | null };
          } catch (error) {
            return { row, models: [] as PickerModel[], failure: failureOf(error) };
          }
        }),
      );
      const models: PickerModel[] = [];
      const seen: PickerFailure[] = [];
      for (const entry of settled) {
        models.push(...entry.models);
        if (entry.failure !== null) seen.push({ provider: entry.row.id, title: entry.row.title, failure: entry.failure });
      }
      loaded.value = models;
      failures.value = seen;
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
    highlighted.value = shown.value.length > 0 ? 0 : -1;
  }

  function moveHighlight(delta: number): void {
    const count = shown.value.length;
    if (count === 0) {
      highlighted.value = -1;
      return;
    }
    if (highlighted.value < 0) {
      highlighted.value = delta > 0 ? 0 : count - 1;
      return;
    }
    highlighted.value = Math.min(Math.max(highlighted.value + delta, 0), count - 1);
  }

  async function pickModel(modelId: string): Promise<void> {
    if (picking.value) return;
    picking.value = true;
    pickError.value = null;
    try {
      await setDefaultModel(kvman, modelId);
      open.value = false;
      query.value = '';
      highlighted.value = -1;
      await options.onPicked();
    } catch (error) {
      pickError.value = failureOf(error);
    } finally {
      picking.value = false;
    }
  }

  return {
    open,
    query,
    highlighted,
    loading,
    picking,
    pickError,
    failures,
    groups,
    shown,
    hidden,
    callableCount,
    defaultId,
    openPicker,
    closePicker,
    togglePicker,
    setQuery,
    moveHighlight,
    pickModel,
  };
}

/** The picker's state, passed from the default card to the popover. */
export type ModelPickerState = ReturnType<typeof useModelPicker>;
